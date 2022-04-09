package util

import (
	"bytes"
	"encoding/json"

	"github.com/fmpwizard/go-quilljs-delta/delta"
)

// NEXT Milestone ?? if we need other commands that don't fit the admittedly hacky
// "check if DocumentId and ClientId and Change" exist.
// type OTCommandId uint32

// const (
// 	OTCommandNewDocument OTCommandId = 1
// 	OTCommandNewClient   OTCommandId = 2
// 	OTCommandChange                  = 3
// 	OTCommandGetDocument             = 4
// )

// type SessionOTMessage struct {
// 	DocumentId uint32
// 	ClientId   string
// 	Change     ot.Change
// }

type CommandType uint32

const (
	Respond CommandType = iota // auto assign ints
	NewDoc
	NewChange
	GetDoc
)

type Message struct {
	Command    CommandType
	DocumentID string
	ClientID   string
	Delta      delta.Delta // NEXT: no versioning...
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
