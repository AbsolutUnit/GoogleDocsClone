package util

import (
	"bytes"
	"encoding/json"

	"github.com/xxuejie/go-delta-ot/ot"
)

type CommandType uint32

// TODO: add relevant presence info to different types

const (
	NewDoc CommandType = iota // auto assign ints
	NewChanges
	GetDoc
	GetHTML
)

type Cursor struct {
	Index  int    `json:"index"`
	Length int    `json:"length"`
	Name   string `json:"name"`
}

type Presence struct {
	ID     string `json:"id"` // client id
	Cursor Cursor `json:"cursor"`
}

type Message struct {
	Command    CommandType
	DocumentID string
	ClientID   string
	Change     ot.Change
	Presence   Presence
}

func Serialize[Model any](msg Model) ([]byte, error) {
	var b bytes.Buffer
	encoder := json.NewEncoder(&b)
	err := encoder.Encode(msg)
	return b.Bytes(), err
}

func Deserialize[Model any](b []byte) (Model, error) {
	var msg Model
	buf := bytes.NewBuffer(b)
	decoder := json.NewDecoder(buf)
	err := decoder.Decode(&msg)
	return msg, err
}
