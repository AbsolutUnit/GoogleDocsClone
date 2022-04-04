package session

import (
	"encoding/json"
	"final"
	"final/internal/rbmq"
	"final/internal/store"
	"final/internal/util"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/fmpwizard/go-quilljs-delta/delta"
	"github.com/streadway/amqp"
)

type SessionServer struct {
	config SessionConfig
	docs   store.Repository[SessionDocument, string]
	// NEXT Milestone 2
	accts        store.Repository[Account, string]
	amqp         rbmq.Broker
	stoppingChan chan bool
}

func NewSessionServer(config SessionConfig) (ss SessionServer) {
	ss = SessionServer{}
	ss.docs = store.NewInMemoryStore[SessionDocument, string]()
	// NEXT Milestone 2 change this
	ss.docs.Store(SessionDocument{id: "1"})
	// NEXT Milestone 2
	// ss.accts.Store(data Account)
	ss.amqp = rbmq.NewRabbitMq(ss.config.AmqpUrl)
	return
}

// Given a message containing the document id, client id, and transformed change,
// write appropriate server side events to all those who are editing the document.
func (ss SessionServer) consumeOTResponse(msg amqp.Delivery) {
	// TODO Do we need to check any info about the message?
	transformed, err := util.Deserialize[util.SessionOTMessage](msg.Body)
	if err != nil {
		final.LogError(err, "Could not deserialize OT response.")
	}
	for _, c := range ss.docs.FindById(fmt.Sprint(transformed.DocumentId)).Connections {
		// write data to c if c.Id() is not transformed.ClientId
		if c.Id() != transformed.ClientId {
			c.Events <- &EventData{Data: transformed.Change.Delta}
		}
	}
}

// Listen for new OT transforms
func (ss SessionServer) Listen() {
	responses := ss.amqp.Consume(ss.config.ExchangeName, "direct", "session", "session")

	stopping := false
	for !stopping {
		select {
		case <-ss.stoppingChan:
			stopping = true
		case msg := <-responses:
			final.LogDebug(nil, "Session received: "+string(msg.Body))
			ss.consumeOTResponse(msg)
		}
	}
	// I don't know of any cleanup.
	ss.stoppingChan <- true
}

func (ss SessionServer) addCse356Header(w http.ResponseWriter) {
	w.Header().Add("X-CSE356", ss.config.Cse356Id)
}

func (ss SessionServer) addSSEHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Connection", "keep-alive")
}

func (ss SessionServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ss.addCse356Header(w)
	final.LogDebug(nil, fmt.Sprintf("[%s][in] %s", r.Method, r.URL.Path))

	defer r.Body.Close()
	// switch on the endpoints
	// ASSUMPTION: "connect", "op", "doc" not part of session id
	switch {
	case strings.Contains(r.URL.Path, "connect/"):
		ss.handleConnect(w, r)
	case strings.Contains(r.URL.Path, "op/"):
		ss.handleOp(w, r)
	case strings.Contains(r.URL.Path, "doc/"):
		ss.handleDoc(w, r)
	}
}

// Get the entire document as a []byte to send back to the client over SSE.
func (ss SessionServer) retrieveFullDocument(doc SessionDocument, client SSEClient) []byte {
	// First, create the serialized data to send to the OT server.
	msg, err := util.Serialize(util.SessionOTMessage{
		DocumentId: 1, // NEXT Milestone 2
		ClientId:   client.Id(),
	})
	if err != nil {
		final.LogError(err, "Could not serialize message to OT server.")
	}
	// NEXT Milestone 3 change "ot1" to "ot" + documentId % 10
	// Next, let's send the message.
	err = ss.amqp.Publish(ss.config.ExchangeName, "direct", "newClient", string(msg))
	if err != nil {
		final.LogError(err, "Could not publish message to AMQP.")
	}
	responses := ss.amqp.Consume(ss.config.ExchangeName, "direct", "", "newClient")
	if err != nil {
		final.LogError(err, "Could not consume message from OT server.")
	}
	sseMsg, err := util.Deserialize[util.SessionOTMessage]((<-responses).Body)
	if err != nil {
		final.LogError(err, "Could not deserialize message from OT server.")
	}
	sseData, _ := util.Serialize(EventData{Data: struct {
		Content any `json:"content"`
	}{Content: sseMsg.Change.Delta}})
	return sseData
}

// Parse ClientID from r
func clientIdFromRequest(r *http.Request) string {
	lastSlash := strings.LastIndex(r.URL.Path, "/")
	return r.URL.Path[lastSlash+1:]
}

func (ss SessionServer) handleConnect(w http.ResponseWriter, r *http.Request) {
	clientId := clientIdFromRequest(r)
	final.LogDebug(nil, fmt.Sprintf("Found clientId: %s", clientId))

	// NEXT M2: doc with ClientID in SSEClient inClients slice
	doc := ss.docs.FindById("1")
	// NEXT if no doc exists, create OTDocument - not issue for M1
	client, exists := doc.Connections[clientId]
	final.LogDebug(nil, fmt.Sprintf("Checked for client in storage. Exists: %t", exists))

	// SSE headers.
	ss.addSSEHeaders(w)
	final.LogDebug(nil, "Added SSE headers.")

	// If this client has not connected yet
	timeout := time.After(1 * time.Second)
	var sseData []byte

	// Run this in a go func so we can get the existsChan in a channel.
	existsChan := make(chan bool)
	go func() {
		if !exists {
			doc.Connections[clientId] = SSEClient{
				id:     clientId,
				Events: make(chan *EventData),
			}
			sseData = ss.retrieveFullDocument(doc, client)
		}
	}()

	// select the results.
	select {
	case msg := <-client.Events:
		sseData, _ = util.Serialize(*msg)
		fmt.Fprintf(w, "%v", sseData)
	case <-existsChan:
		fmt.Fprintf(w, "%v", sseData)
	case <-timeout:
	}

	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

func (ss SessionServer) handleOp(w http.ResponseWriter, r *http.Request) {
	clientId := clientIdFromRequest(r)
	msg := util.SessionOTMessage{
		DocumentId: 1, // NEXT Milestone 1 specific
		ClientId:   clientId,
	}
	if r.Method == http.MethodPost {
		bodyDelta := delta.Delta{}
		json.NewDecoder(r.Body).Decode(&bodyDelta)
		// NEXT Milestone ??? - does this have version in it?
		msg.Change.Delta = bodyDelta
	}
	msgBytes, err := util.Serialize(msg)
	if err != nil {
		final.LogError(err, "Could not serialize sent op.")
	}
	err = ss.amqp.Publish(ss.config.ExchangeName, "direct", "ot1", string(msgBytes))
	if err != nil {
		final.LogError(err, "Could not publish op to amqp.")
	}
}

func (ss SessionServer) handleDoc(w http.ResponseWriter, r *http.Request) {
	msg := util.SessionOTMessage{
		DocumentId: 1,
		ClientId:   "",
	}
	if r.Method == http.MethodGet {
		msgBytes, err := util.Serialize(msg)
		if err != nil {
			final.LogError(err, "Could not serialize sent op.")
		}
		ss.amqp.Publish(ss.config.ExchangeName, "direct", "ot1", string(msgBytes))

		timeout := time.After(10 * time.Second)
		response := ss.amqp.Consume(ss.config.ExchangeName, "direct", "", "html")
		select {
		case <-timeout:
			final.LogError(nil, "Timed out waiting for HTML response.")
		case msgBytes := <-response:
			fmt.Fprint(w, msgBytes)
		}
	}
}
