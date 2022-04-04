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
	AmqpUrl string
	Db      struct {
		Type     OTConfigDbType
		Uri      string
		DbName   string
		Password string
	}
	ExchangeName string
}

func NewOTConfig(r io.Reader) (cfg OTConfig) {
	json.NewDecoder(r).Decode(&cfg)
	return
}
