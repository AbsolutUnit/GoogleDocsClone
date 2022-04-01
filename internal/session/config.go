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
	AmqpUrl  string
	ClaimKey string
	Cse356Id string
	Db       struct {
		Type     SessionConfigDbType
		Uri      string
		DbName   string
		Password string
	}
	ExchangeName string
}

func NewSessionConfig(r io.Reader) (cfg SessionConfig) {
	json.NewDecoder(r).Decode(&cfg)
	return
}
