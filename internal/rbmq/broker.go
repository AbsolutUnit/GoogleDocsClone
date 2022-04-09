package rbmq

import "github.com/streadway/amqp"

type Broker interface {
	Publish(exchangeName, exchangeType, key, message string) (*amqp.Channel, error)
	Consume(exchangeName, exchangeType, queueName, key string) (*amqp.Channel, <-chan amqp.Delivery)
	Close()
}
