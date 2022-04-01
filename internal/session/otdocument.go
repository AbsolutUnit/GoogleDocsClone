package session

type Connection struct {
	Account Account
}

type OTDocument struct {
	id 	string
	Connections []Connection
}
