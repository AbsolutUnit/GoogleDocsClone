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
	QueueBind()


type Rbmq struct {
	conn *amqp.Connection
	ch   *amqp.Channel
}

func NewRbmq(url string) *Rbmq {
	conn, err := amqp.Dial(url)
	LogFatal(err, "Failed to connect to RabbitMQ")

	ch, err := conn.Channel()
	LogFatal(err, "Failed to open a channel")

	return &Rbmq{
		conn,
		ch,
	}
}
