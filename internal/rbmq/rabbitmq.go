package rbmq

import (
	"final"
	"fmt"

	"github.com/streadway/amqp"
)

type RabbitMq struct {
	conn *amqp.Connection
}

func NewRabbitMq(dialUrl string) RabbitMq {
	// Test connection
	conn, err := amqp.Dial(dialUrl)
	if err != nil {
		final.LogFatal(err, "Could not connect to amqp server.")
	}
	rm := RabbitMq{
		conn,
	}

	// Setup a channel to make sure we can.
	ch := rm.setupChannel()
	ch.Close()

	return rm
}

func (rm RabbitMq) setupChannel() *amqp.Channel {
	ch, err := rm.conn.Channel()
	if err != nil {
		final.LogFatal(err, "Failed to open a channel")
	}
	return ch
}

func (rm RabbitMq) Consume(exchangeName, exchangeType, queueName, key string) (*amqp.Channel, <-chan amqp.Delivery) {
	ch := rm.setupChannel()

	err := ch.ExchangeDeclare(
		exchangeName,
		exchangeType,
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		final.LogFatal(err, "Failed to declare the exchange.")
	}

	q, err := ch.QueueDeclare(queueName, true, false, true, false, nil)
	if err != nil {
		final.LogFatal(err, "Failed to declare the queue.")
	}

	// Bind to the queue.
	err = ch.QueueBind(q.Name, key, exchangeName, false, nil)
	if err != nil {
		final.LogFatal(err, "Failed to bind to the queue.")
	}

	responses, err := ch.Consume(q.Name, "", true, false, false, false, nil)
	if err != nil {
		final.LogFatal(err, "Failed to start consuming from OT servers. Have you initialized RabbitMQ?")
	}

	return ch, responses
}

func (rm RabbitMq) Publish(exchangeName, exchangeType, key, message string) (*amqp.Channel, error) {
	ch := rm.setupChannel()

	err := ch.ExchangeDeclare(
		exchangeName,
		exchangeType,
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		final.LogFatal(err, "Failed to declare an exchange.")
	}

	err = ch.Publish(exchangeName, key, true, false, amqp.Publishing{
		ContentType: "text/plain",
		Body:        []byte(message),
	})
	if err != nil {
		final.LogFatal(err,
			fmt.Sprintf("Failed to publish message %0.15s to exchange %0.15s key %0.15s",
				message, exchangeName, key))
	}

	return ch, err
}

func (rm RabbitMq) Close() {
	rm.conn.Close()
}
