package ot

import (
	"final"
	"fmt"
	"net/http"
	"final/internal/rbmq"
	"github.com/xxuejie/go-delta-ot/ot"
	"github.com/fmpwizard/go-quilljs-delta/delta"
)

type OTServer struct {
	config OTConfig
	docs store.Repository[Document]
	amqp rbmq.RabbitMq
	fileServer ot.MultiFileNewServer
}

type Document struct {
	contents delta.Delta
	ID string
	clientIds []string
} 

func (ots OTServer) Get (html string){
	//bold, italics, normal, line break
	for _, op := range ots.Ops {
		if op.attributes == nil {
			if string(op.insert) == "\n" {
				html += "<br/>"
			}
			html += fmt.Sprintf("<p>%s</p>", string(op.insert))
		}
	}
}
