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

type SessionConfigDb struct {
	Type     SessionConfigDbType `json:"type"`
	Uri      string              `json:"uri"`
	DbName   string              `json:"dbName"`
	Password string              `json:"password"`
}

type SessionConfigSMTP struct {
	Name     string `json:"name"`
	Identity string `json:"identity"`
	Username string `json:"username"`
	Password string `json:"password"`
	Host     string `json:"host"`
}

type SessionConfig struct {
	AmqpUrl      string            `json:"amqpUrl"`
	ClaimKey     string            `json:"claimKey"`
	Cse356Id     string            `json:"cse356Id"`
	Db           SessionConfigDb   `json:"db"`
	ExchangeName string            `json:"exchangeName"`
	Hostname     string            `json:"hostname"`
	Smtp         SessionConfigSMTP `json:"smtp"`
	VerifyKey    string            `json:"verifyKey"`
}

func NewSessionConfig(r io.Reader) (cfg SessionConfig) {
	json.NewDecoder(r).Decode(&cfg)
	return
}
