package rbmq

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"final"

	"github.com/streadway/amqp"
)

type MessageQueue interface {
	DeclareExchange()
	DeclareQueueBind()
	Publish()
	Consume()
}


type Rbmq struct {
	conn *amqp.Connection
	ch   *amqp.Channel
}

func NewRbmq(url string) *Rbmq {
	conn, err := amqp.Dial(url)
	if err != nil {
		LogFatal(err, "Failed to connect to RabbitMQ")
	}

	ch, err := conn.Channel()
	if err != nil {
		LogFatal(err, "Failed to open a channel")
	}

	return &Rbmq{
		conn,
		ch,
	}
}

func (mq *Rbmq) DeclareBindQueues(keys []string, ExchangeName string) {
	// Declare Queues
	q, err = mq.ch.QueueDeclare (
		"",    // name
		false, // durable
		false, // delete when unused
		true,  // exclusive
		false, // no-wait
		nil,   // arguments
	)
	// Bind Queues
	for _, key := range keys {
		mq.ch.QueueBind(
			
		)
	}
}
