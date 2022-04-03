package rbmq

import (
	"final"
	"fmt"

	"github.com/streadway/amqp"
)

type RabbitMq struct {
	conn *amqp.Connection
	ch   *amqp.Channel
}

func NewRabbitMq(dialUrl string) RabbitMq {
	conn, err := amqp.Dial(dialUrl)
	final.LogFatal(err, "Could not connect to amqp server.")

	ch, err := conn.Channel()
	final.LogFatal(err, "Failed to open a channel")

	return RabbitMq{
		conn: conn,
		ch:   ch,
	}
}

func (rm RabbitMq) Close() {
	defer rm.conn.Close()
	defer rm.ch.Close()
}

func (rm RabbitMq) Consume(exchangeName, exchangeType, queueName, key string) <-chan amqp.Delivery {
	err := rm.ch.ExchangeDeclare(
		exchangeName,
		exchangeType,
		true,
		false,
		false,
		false,
		nil,
	)
	final.LogFatal(err, "Failed to declare an exchange.")

	q, err := rm.ch.QueueDeclare(queueName, true, false, true, false, nil)

	// Bind to the queue.
	err = rm.ch.QueueBind(q.Name, key, exchangeName, false, nil)
	final.LogFatal(err, "Failed to bind to the queue.")

	responses, err := rm.ch.Consume(q.Name, "", true, false, false, false, nil)
	final.LogFatal(err, "Failed to start consuming from OT servers. Have you initialized RabbitMQ?")

	return responses
}

func (rm RabbitMq) Publish(exchangeName, exchangeType, key, message string) error {
	err := rm.ch.ExchangeDeclare(
		exchangeName,
		exchangeType,
		true,
		false,
		false,
		false,
		nil,
	)
	final.LogFatal(err, "Failed to declare an exchange.")

	err = rm.ch.Publish(exchangeName, key, true, false, amqp.Publishing{
		ContentType: "text/plain",
		Body:        []byte(message),
	})
	final.LogFatal(err,
		fmt.Sprintf("Failed to publish message %0.15s to exchange %0.15s key %0.15s",
			message, exchangeName, key))

	return err
}
