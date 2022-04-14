package session

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
	"time"

	"final"
	"final/internal/rbmq"
	"final/internal/store"
	"final/internal/util"

	"github.com/bwmarrin/snowflake"
	"github.com/fmpwizard/go-quilljs-delta/delta"
	"github.com/streadway/amqp"
	"github.com/xxuejie/go-delta-ot/ot"
)

type EventData struct {
	Content  []delta.Op    `json:"content,omitempty"`
	Presence util.Presence `json:"presence,omitempty"`
	Ack      []delta.Op    `json:"ack,omitempty"`
	Version  uint32        `json:"version,omitempty"`
	Op       []delta.Op    `json:"op,omitempty"`
}

type Client struct {
	id        string
	Account   *Account
	Events    chan *EventData
	LoggedOut chan bool
}

func (sc Client) Id() string {
	return sc.id
}

type SessionDocument struct {
	id           string
	Name         string
	Clients      map[string]Client        // key is a clientId
	Presences    map[string]util.Presence // key is a clientId
	LastModified time.Time
	Acks         chan *[]delta.Op
	VersionHack  uint64
}

func (sd SessionDocument) Id() string {
	return sd.id
}

func NewSessionDocument(id string, name string) SessionDocument {
	return SessionDocument{
		id:           id,
		Name:         name,
		Clients:      make(map[string]Client),
		Presences:    make(map[string]util.Presence),
		LastModified: time.Now(),
		Acks:         make(chan *[]delta.Op),
		// VersionHack?
	}
}

type AccountClient struct {
	AccountId string
	Clients   []*Client
}

func (ac AccountClient) Id() string {
	return ac.AccountId
}

type SessionServer struct {
	config       SessionConfig
	idFactory    *snowflake.Node
	docs         store.Repository[SessionDocument, string]
	accDb        store.Repository[Account, string]
	accCache     store.Repository[AccountClient, string]
	amqp         rbmq.Broker
	stoppingChan chan bool
}

func NewSessionServer(config SessionConfig) (ss SessionServer) {
	ss = SessionServer{}
	ss.config = config
	ss.idFactory, _ = snowflake.NewNode(1)
	// TODO: discuss memory store vs mongodb. Why not do it all in memory?
	ss.docs = store.NewInMemoryStore[SessionDocument, string]()
	ss.accDb = store.NewMongoDbStore[Account, string](ss.config.Db.Uri, ss.config.Db.DbName, "accounts", time.Minute)
	ss.accCache = store.NewInMemoryStore[AccountClient, string]()
	ss.amqp = rbmq.NewRabbitMq(ss.config.AmqpUrl)
	ss.stoppingChan = make(chan bool)
	return
}

// Listen for new OT transforms
func (ss SessionServer) Listen() {
	ch, responses := ss.amqp.Consume(ss.config.ExchangeName, "direct", "session", "session")
	defer ch.Close()

	stopping := false
	for !stopping {
		select {
		case <-ss.stoppingChan:
			stopping = true
		case msg := <-responses:
			final.LogDebug(nil, "Session received: "+string(msg.Body))
			// Do not run this in a goroutine, because we might have
			// successive changes to the same document which can
			// cause a race condition.
			ss.consumeOTResponse(msg)
		}
	}
	// I don't know of any cleanup.
	ss.stoppingChan <- true
}

// Given a util.Message, write appropriate server side events to all those who are editing the document.
func (ss SessionServer) consumeOTResponse(msg amqp.Delivery) {
	// First, we deserialize the message.
	otMsg, err := util.Deserialize[util.Message](msg.Body)
	if err != nil {
		final.LogError(err, "Could not deserialize OT response.")
	}
	// Then, we want to convert this to our EventData.
	eventMsg := EventData{}
	if (otMsg.Change != ot.Change{}) {
		eventMsg.Op = otMsg.Change.Delta.Ops
		// for some reason we dont want to send back version with the op
	} else {
		eventMsg.Presence = otMsg.Presence
	}
	doc, _ := ss.docs.FindById(fmt.Sprint(otMsg.DocumentID))
	for _, c := range doc.Clients {
		if c.Id() != otMsg.ClientID {
			c.Events <- &eventMsg
		} else {
			// If these are the same, then we need to send an Ack of the _untransformed_ change.
			if (otMsg.Change != ot.Change{}) {
				ackOp := <-doc.Acks
				c.Events <- &EventData{Ack: *ackOp} // NOTE: this might be wrong since it is not the untransformed op
			} // don't send anything if presence
		}
	}
}

func (ss SessionServer) addCse356Header(w http.ResponseWriter) {
	w.Header().Add("X-CSE356", ss.config.Cse356Id)
}

func (ss SessionServer) addSSEHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Connection", "keep-alive")
}

func (ss SessionServer) writeOk(w http.ResponseWriter, ok string) {
	type respOk struct {
		Ok string `json:"error"`
	}
	// TODO maybe add logging?
	json.NewEncoder(w).Encode(respOk{Ok: ok})
}

func (ss SessionServer) writeRetry(w http.ResponseWriter, ret string) {
	type respRetry struct {
		Retry string `json:"retry"`
	}
	// TODO maybe add logging?
	json.NewEncoder(w).Encode(respRetry{Retry: ret})
}

func (ss SessionServer) writeError(w http.ResponseWriter, err string) {
	type respError struct {
		Error string `json:"error"`
	}
	// TODO maybe add logging?
	json.NewEncoder(w).Encode(respError{Error: err})
}

func parseRequestIDs(r *http.Request) (docID string, clientID string, mediaID string, err error) {
	split := strings.Split(r.URL.Path, "/")
	if strings.HasPrefix(r.URL.Path, "/media/access/") {
		mediaID = split[len(split)-1]
		return
	}
	if strings.HasPrefix(r.URL.Path, "/doc/edit/") {
		docID = split[len(split)-1]
		return
	}
	if strings.HasPrefix(r.URL.Path, "/doc/") {
		docID = split[len(split)-2]
		clientID = split[len(split)-1]
		return
	}
	err = errors.New("the request URL does not contain IDs to be parsed")
	return
}

func (ss SessionServer) LogRequestIn(w http.ResponseWriter, r *http.Request) {
	str := fmt.Sprintf("[%s][in] %s\n", r.Method, r.URL.Path)

	buf, bodyErr := ioutil.ReadAll(r.Body)
	if bodyErr != nil {
		final.LogError(bodyErr, "Could not deserialize body.")
		return
	}
	rdr1 := ioutil.NopCloser(bytes.NewBuffer(buf))
	rdr2 := ioutil.NopCloser(bytes.NewBuffer(buf))

	str += fmt.Sprintf("[body] %q", rdr1)
	r.Body = rdr2
	final.LogDebug(nil, str)
}

func (ss SessionServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ss.addCse356Header(w)
	ss.LogRequestIn(w, r)

	defer r.Body.Close()

	if strings.HasPrefix(r.URL.Path, "/users") {
		ss.handleUsers(w, r)
	} else if strings.HasPrefix(r.URL.Path, "/home") {
	} else {
		// Check for authentication.
		cookie, err := r.Cookie("token")
		if err != nil {
			ss.writeError(w, "Unauthorized")
			return
		}
		// Get email from JWT.
		email, err := EmailFrom(cookie.Value, ss.config.ClaimKey)
		if err != nil {
			ss.writeError(w, "Unauthorized")
			return
		}

		// Switch for the endpoints.
		switch {
		case strings.HasPrefix(r.URL.Path, "/collection/"):
			ss.handleCollection(email, w, r)
		case strings.HasPrefix(r.URL.Path, "/doc/"):
			ss.handleDoc(email, w, r)
		case strings.HasPrefix(r.URL.Path, "/media/"):
			ss.handleMedia(email, w, r)
		}
	}
}

func (ss SessionServer) handleHome(w http.ResponseWriter, r *http.Request) {
	// TODO: actually not sure what to do here.
}
