package session

import (
	"final/internal/util"

	"github.com/fmpwizard/go-quilljs-delta/delta"
)

type EventData struct {
	Content  delta.Delta   `json:"content",omitempty`
	Presence util.Presence `json:"presence",omitempty` // TODO: why is this a pointer?
	Ack      delta.Delta   `json:"ack",omitempty`
	Version  uint32        `json:"version",omitempty`
	Op       delta.Delta
}

type Client struct {
	id        string
	Account   *Account
	Events    chan *EventData
	LoggedOut chan bool
}

func (sc Client) Id() string {
	return sc.id
}

type SessionDocument struct {
	id        string
	Name      string
	Clients   map[string]Client        // key is a clientId
	Presences map[string]util.Presence // key is a clientId
}

func (sd SessionDocument) Id() string {
	return sd.id
}
