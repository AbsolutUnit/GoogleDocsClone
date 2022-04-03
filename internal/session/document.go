package session

import "net/http"

type Connection struct {
	Account Account
	w http.ResponseWriter
}

type SessionDocument struct {
	id 	string
	Connections []Connection
}

func (sd SessionDocument) Id() string {
	return sd.id
}
