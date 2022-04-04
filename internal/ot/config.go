package ot

import (
	"encoding/json"
	"io"
)

type OTConfigDbType string

const (
	OTConfigMongo     OTConfigDbType = "mongo"
	OTConfigCassandra                = "cassandra"
)

type OTConfig struct {
	AmqpUrl string `json:"amqpUrl"`
	Db      struct {
		Type     OTConfigDbType `json:"type"`
		Uri      string         `json:"uri"`
		DbName   string         `json:"dbName"`
		Password string         `json:"password"`
	} `json:"db"`
	ExchangeName string `json:"exchangeName"`
}

func NewOTConfig(r io.Reader) (cfg OTConfig) {
	json.NewDecoder(r).Decode(&cfg)
	return
}
