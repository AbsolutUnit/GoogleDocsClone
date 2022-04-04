package session

import (
	"encoding/json"
	"io"
)

type SessionConfigDbType string

const (
	SessionConfigMongo     SessionConfigDbType = "mongo"
	SessionConfigCassandra                     = "cassandra"
)

type SessionConfig struct {
	AmqpUrl  string `json:"amqpUrl"`
	ClaimKey string `json:"claimKey"`
	Cse356Id string `json:"cse356Id"`
	Db       struct {
		Type     SessionConfigDbType `json:"type"`
		Uri      string              `json:"uri"`
		DbName   string              `json:"dbName"`
		Password string              `json:"password"`
	} `json:"db"`
	ExchangeName string `json:"exchangeName"`
}

func NewSessionConfig(r io.Reader) (cfg SessionConfig) {
	json.NewDecoder(r).Decode(&cfg)
	return
}
