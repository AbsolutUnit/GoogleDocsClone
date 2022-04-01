package session

import "net/http"

type Connection struct {
	Account Account
	w http.ResponseWriter
}

type OTDocument struct {
	id 	string
	Connections []Connection
}

func (ot OTDocument) Id() string {
	return ot.id
}
