package session

import (
	"final"
	"final/internal/rbmq"
	"final/internal/store"
	"final/internal/util"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/streadway/amqp"
)

type SessionServer struct {
	config SessionConfig
	docs   store.Repository[SessionDocument]
	// NEXT Milestone 2
	accts        store.Repository[Account]
	amqp         rbmq.Broker
	stoppingChan chan bool
}

func NewSessionServer(config SessionConfig) (ss SessionServer) {
	ss = SessionServer{}
	ss.docs = store.NewInMemoryStore[SessionDocument]()
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
	// needs to be added to the util :(
	transformed := util.SessionOTMessage{}
	json.NewDecoder(&transformed).Decode(bytes.NewReader(msg.Body))
	// NEXT Milestone 1 requires only one document, update this when Milestone 2 comes
	for i, c := range ss.docs.FindById(transformed.DocumentId).Connections {
		// write data to c if c.Id() is not transformed.ClientId
		c.events <- transformed.Change.Delta
	}
}

// Listen for new OT transforms
func (ss SessionServer) Listen() {
	responses := ss.amqp.Consume(ss.config.ExchangeName, "direct", "session")

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
		ss.handleGetDoc(w, r)
	}
}

// Get the entire document as a []byte to send back to the client over SSE.
func (ss SessionServer) retrieveFullDocument(doc SessionDocument, client SSEClient) []byte {
	// First, create the serialized data to send to the OT server.
	msg, err := util.Serialize[util.SessionOTMessage](util.SessionOTMessage{
		DocumentId: "1", // NEXT Milestone 2
		ClientId:   client.Account.Id(),
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
	sseMsg, err := util.Deserialize[util.SessionOTMessage]((<-responses).Body)
	if err != nil {
		final.LogError(err, "Could not deserialize message from OT server.")
	}
	sseData, _ := util.Serialize(EventData{Data: struct {
		Content any `json:"content"`
	}{Content: sseMsg.Change.Delta}})
	return sseData
}

func (ss SessionServer) handleConnect(w http.ResponseWriter, r *http.Request) {
	// parse ClientID from r
	lastSlash := strings.LastIndex(r.URL.Path, "/")
	clientId := r.URL.Path[lastSlash+1:]

	// query db for document (NEXT M2: doc with ClientID in SSEClient inClients slice)
	var doc SessionDocument = ss.docs.FindById("1")
	// NEXT if no doc exists, create OTDocument - not issue for M1
	client, exists := doc.Connections[clientId]

	// SSE headers.
	ss.addSSEHeaders(w)

	// If this client has not connected yet
	timeout := time.After(1 * time.Second)
	var sseData []byte

	// Run this in a go func so we can get the existsChan in a channel.
	existsChan := make(chan bool)
	go func() {
		if !exists {
			sseData = ss.retrieveFullDocument(doc, client)
		}
	}()

	// select the results.
	select {
	case msg := <-client.Events:
		sseData, _ = util.Serialize[EventData](*msg)
		fmt.Fprintf(w, "%v", sseData)
	case <-existsChan:
		fmt.Fprintf(w, "%v", sseData)
	case <-timeout:
	}

	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}
