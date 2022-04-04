package session

type EventData struct {
	Data any `json:"data"`
}

type SSEClient struct {
	Account Account
	Events  chan *EventData
}

type SessionDocument struct {
	id          string
	Connections map[string]SSEClient // string is a clientId
}

func (sd SessionDocument) Id() string {
	return sd.id
}
