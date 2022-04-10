package util

import (
	"bytes"
	"encoding/json"

	"github.com/fmpwizard/go-quilljs-delta/delta"
)

type CommandType uint32

// TODO: add relevant presence info to different types

const (
	NewDoc CommandType = iota // auto assign ints
	NewChanges
	GetDoc
	GetHTML
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
