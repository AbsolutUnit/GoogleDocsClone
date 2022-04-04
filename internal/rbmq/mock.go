package rbmq

import (
	"errors"
	"final"

	"github.com/streadway/amqp"
)

type MockRbmq struct {
}

func NewMockRbmq() MockRbmq {
	return MockRbmq{}
}

func (mr MockRbmq) Publish(exchangeName, exchangeType, key, message string) error {
	err := errors.New("not implemented.")
	final.LogFatal(err, "mock publish.")
	return err
}

func (mr MockRbmq) Consume(exchangeName, exchangeType, queueName, key string) <-chan amqp.Delivery {
	err := errors.New("not implemented.")
	final.LogFatal(err, "mock consume.")
	return make(<-chan amqp.Delivery)
}

func (mr MockRbmq) Close() {
	err := errors.New("not implemented.")
	final.LogFatal(err, "mock close.")
}
