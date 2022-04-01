package session

import (
	"final"
	"final/internal/store"
	"final/internal/util"
	"fmt"
	"net/http"

	"github.com/streadway/amqp"
)

type SessionServer struct {
	config SessionConfig
	// NEXT Milestone 2
	docs  store.Repository[OTDocument]
	accts store.Repository[Account]
	conn  *amqp.Connection
	ch    *amqp.Channel
}

func NewSessionServer(config SessionConfig) (ss SessionServer) {
	ss = SessionServer{}
	ss.docs = store.NewInMemoryStore[OTDocument]()
	ss.docs.Store(OTDocument{id: "1"})
	return
}

// Given a message containing the document id, client id, and transformed change,
// write appropriate server side events to all those who are editing the document.
func (ss SessionServer) handleOTResponse(msg amqp.Delivery) {
	// needs to be added to the util :(
	// transformed := util.ServerOTMessage{}
	// json.NewDecoder(&transformed).Decode(bytes.NewReader(msg.Body))
	// NEXT Milestone 1 requires only one document, update this when Milestone 2 comes
	// toWrite := struct {
	// data []util.ServerOTMessage{}
	// }
	// for i,c := range docs.FindById(transformed.DocumentId) {
	// //	hacky write, but a bit more performant?
	// }
}

func (ss SessionServer) InitRbmq() {
	conn, err := amqp.Dial(ss.config.AmqpUrl)
	final.LogFatal(err, "Could not connect to amqp server.")
	ss.conn = conn

	ch, err := conn.Channel()
	final.LogFatal(err, "Failed to open a channel")
	ss.ch = ch

	err = ss.ch.ExchangeDeclare(
		ss.config.ExchangeName,
		"direct",
		true,
		false,
		false,
		false,
		nil,
	)
	final.LogFatal(err, "Failed to declare an exchange.")

	// Bind to the queue.
	err = ch.QueueBind("session", "", ss.config.ExchangeName, false, nil)
	final.LogFatal(err, "Failed to bind to the queue.")
}

// Listen for new OT transforms
func (ss SessionServer) Start() (err error) {
	// Listen for responses from the OT servers
	responses, err := ss.ch.Consume("session", "", true, false, false, false, nil)
	final.LogFatal(err, "Failed to start consuming from OT servers. Have you initialized RabbitMQ?")
	go func() {
		for d := range responses {
			final.LogDebug(nil, "Session received: "+string(d.Body))
			ss.handleOTResponse(d)
		}
	}()

	err = http.ListenAndServe(":8080", ss)
	return
}

func (ss SessionServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	util.AddCse356Header(w, ss.config.Cse356Id)
	final.LogDebug(nil, fmt.Sprintf("[%s][in] %s", r.Method, r.URL.Path))

	defer r.Body.Close()
	// switch on the endpoints
	switch r.URL.Path {
	}
}
