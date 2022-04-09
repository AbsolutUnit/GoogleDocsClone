package session

type EventData struct {
	Data any `json:"data"`
}

type Client struct {
	id string
	// Account *Account // TODO: double check we do not need Account here
	Events chan *EventData
}

func (sc Client) Id() string {
	return sc.id
}

type SessionDocument struct {
	id      string
	Name    string
	Clients map[string]Client // string is a clientId
}

func (sd SessionDocument) Id() string {
	return sd.id
}
