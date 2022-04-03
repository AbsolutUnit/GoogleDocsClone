package session

type EventData struct {
	Data any `json:"data"`
}

type Connection struct {
	Account Account
	events chan *EventData
}

type SessionDocument struct {
	id 	string
	Connections []Connection
}

func (sd SessionDocument) Id() string {
	return sd.id
}
