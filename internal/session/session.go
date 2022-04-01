package session

import (
	"bytes"
	"encoding/json"
	"final"
	"final/internal/store"
	"final/internal/util"
	"fmt"
	"net/http"

	"github.com/streadway/amqp"
)

type SessionServer struct {
	config SessionConfig
	// Milestone 2
	// docs   store.Repository[OTDocument]
	doc   OTDocument
	accts store.Repository[Account]
	conn  *amqp.Connection
	ch    *amqp.Channel
}

func NewSessionServer(config SessionConfig) (ss SessionServer) {
	ss = SessionServer{}
	ss.doc = OTDocument{
		id: "1",
	}
	return
}

func (ss SessionServer) handleOTResponse(msg amqp.Delivery) {
	transformed := util.ServerOTMessage{}
	json.NewDecoder(&transformed).Decode(bytes.NewReader(msg.Body))
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
