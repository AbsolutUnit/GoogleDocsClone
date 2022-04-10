package rbmq

import "github.com/streadway/amqp"

type Broker interface {
	Publish(exchangeName, exchangeType, key, message string) (*amqp.Channel, error) // TODO: why is message a string and not a []byte?
	Consume(exchangeName, exchangeType, queueName, key string) (*amqp.Channel, <-chan amqp.Delivery)
	Close()
}
