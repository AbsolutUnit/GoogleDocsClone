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
		if op.Attributes == nil {
			if string(op.Insert) == "\n" { //if just line break
				html += "<br/>"
			} else { //normal text
				html += fmt.Sprintf("<p>%s</p>", string(op.Insert))
			}
		}
		else if { // if attributes exist
			specialTag := string(op.Insert)
			value,exists := op.Attributes["bold"]
			if exists == true {
				specialTag = "<b>" + specialTag + "</b>"
			}
			value,exists = op.Attributes["italic"]
			if exists == true {
				specialTag = "<i>" + specialTag + "</i>"
			}
			html += specialTag
		}
	}
	return
}
