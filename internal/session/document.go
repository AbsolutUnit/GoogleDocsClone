package session

type EventData struct {
	Data any `json:"data"`
}

type SSEClient struct {
	id      string // ID of the client, not the account
	Account Account
	Events  chan *EventData
}

func (sc SSEClient) Id() string {
	return sc.id
}

type SessionDocument struct {
	id          string
	Connections map[string]SSEClient // string is a clientId
}

func (sd SessionDocument) Id() string {
	return sd.id
}
