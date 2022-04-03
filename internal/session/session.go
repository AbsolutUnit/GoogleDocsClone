package session

import (
	"final"
	"final/internal/rbmq"
	"final/internal/store"
	"fmt"
	"net/http"

	"github.com/streadway/amqp"
)

type SessionServer struct {
	config SessionConfig
	docs   store.Repository[SessionDocument]
	// NEXT Milestone 2
	accts store.Repository[Account]
	amqp rbmq.RabbitMq
	stoppingChan chan bool
}

func NewSessionServer(config SessionConfig) (ss SessionServer) {
	ss = SessionServer{}
	ss.docs = store.NewInMemoryStore[SessionDocument]()
	// NEXT Milestone 2 change this
	ss.docs.Store(SessionDocument{id: "1"})
	// NEXT Milestone 2
	// ss.accts.Store(data Account)
	return
}

// Given a message containing the document id, client id, and transformed change,
// write appropriate server side events to all those who are editing the document.
func (ss SessionServer) consumeOTResponse(msg amqp.Delivery) {
	// needs to be added to the util :(
	// transformed := util.SessionOTMessage{}
	// json.NewDecoder(&transformed).Decode(bytes.NewReader(msg.Body))
	// NEXT Milestone 1 requires only one document, update this when Milestone 2 comes
	// for i,c := range docs.FindById(transformed.DocumentId) {
	// write data to c if c.Id() is not transformed.ClientId
	// }
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

func (ss SessionServer) AddCse356Header(w http.ResponseWriter) {
	w.Header().Add("X-CSE356", ss.config.Cse356Id)
}

func (ss SessionServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ss.AddCse356Header(w)
	final.LogDebug(nil, fmt.Sprintf("[%s][in] %s", r.Method, r.URL.Path))

	defer r.Body.Close()
	// switch on the endpoints
	switch r.URL.Path {
	}
}
