package util

import (
	"bytes"
	"encoding/json"

	"github.com/xxuejie/go-delta-ot/ot"
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

type SessionOTMessage struct {
	DocumentId uint32
	ClientId   string
	Change     ot.Change
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
