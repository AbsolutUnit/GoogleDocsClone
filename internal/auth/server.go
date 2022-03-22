package auth

import (
	"encoding/json"
	"final"
	"fmt"
	"net/http"
	"time"

	"final/internal/store"
	"final/internal/util"
)

type AuthServer struct {
	config AuthConfig
	repo   store.Repository[Account]
}

func NewAuthServer(config AuthConfig) (as AuthServer) {
	as = AuthServer{}
	switch config.Db.Type {
	case AuthConfigMongo:
		as.repo = store.NewMongoDb[Account](config.Db.Uri, config.Db.DbName, "auth", 20*time.Second)
		// case AuthConfigCassandra:
		// as.repo = store.NewCassandraDb[Account](config.Db.Uri, config.Db.DbName)
	}
	as.config = config
	return
}

func (as AuthServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	util.AddCse356Header(w, as.config.Cse356Id)
	final.LogDebug(nil, fmt.Sprintf("[%s][in] %s", r.Method, r.URL.Path))

	defer r.Body.Close()
	// switch on relevant endpoints
	switch r.URL.Path {
	case "/login":
	case "/logout":
	case "/verify":
	}
}
