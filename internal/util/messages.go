package util

import (
	"bytes"
	"encoding/json"

	"github.com/xxuejie/go-delta-ot/ot"
)

type Message map[string]any

type SessionOTMessage struct {
	DocumentId string
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
