package auth

import (
	"encoding/json"
	"io"
)

type AuthConfigDbType string

const (
	AuthConfigMongo     AuthConfigDbType = "mongo"
	AuthConfigCassandra                  = "cassandra"
)

type AuthConfig struct {
	Cse356Id string
	Db struct {
		Type     AuthConfigDbType
		Uri      string
		DbName   string
		Password string
	}
}

func NewAuthConfig(r io.Reader) (cfg AuthConfig) {
	json.NewDecoder(r).Decode(&cfg)
	return
}
