package rbmq

import "github.com/streadway/amqp"

type Broker interface {
	Publish(exchangeName, exchangeType, key, message string) error
	Consume(exchangeName, exchangeType, queueName, key string) <-chan amqp.Delivery
	Close()
}
