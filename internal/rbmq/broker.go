package rbmq

import "github.com/streadway/amqp"

type Broker interface {
	Publish(exchangeName, exchangeType, queueName, message string) error
	Consume(exchangeName, exchangeType, queueName string) (chan amqp.Delivery, error)
}
