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
	tokens store.Repository[Token]
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
		as.login(w, r)
	case "/logout":
	case "/verify":
	}
}

func (as AuthServer) errorResp(w http.ResponseWriter, r *http.Request, reason string) {

}

func (as AuthServer) login(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		account := Account{}
		json.NewDecoder(r.Body).Decode(&account)

		// Check for existing account
		loginCand := as.repo.FindByKey("username", account.Username)
		if loginCand.Username == "" {
			as.errorResp(w, r, "Account does not exist.")
		}
		// Validate password
		if !account.ComparePassword(loginCand.Password) {
			as.errorResp(w, r, "Wrong password.")
		}
		// Generate JWT token
		as.tokens.Store(account.CreateJwt(as.config.ClaimKey))
	}
}
