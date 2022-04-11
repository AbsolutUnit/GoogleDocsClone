package session

type EventData struct {
	Data any `json:"data"`
}

type Presence struct {
	Index  string `json:"index"`
	Length string `json:"length"`
}

type Client struct {
	id string
	Account *Account
	Events chan *EventData
	LoggedOut chan bool
}

func (sc Client) Id() string {
	return sc.id
}

type SessionDocument struct {
	id        string
	Name      string
	Clients   map[string]Client   // key is a clientId
	Presences map[string]Presence // key is a clientId
}

func (sd SessionDocument) Id() string {
	return sd.id
}
