package ot

import (
	"final"
	"fmt"
	"strings"
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

func NewOTServer(config OTConfig) OTServer {
    ots := OTServer{}
    ots.docs = store.NewMongoDBStore[Document]()
    ots.fileServer :=  ot.NewMultiFileServer()
    ots.amqp := rbmq.NewRabbitMq(config.AmqpUrl)
}

func (ots OTServer) Start() {
    // start MultiFileServer
    go func() {
	ots.s.Start()
    }()

    for {
	// listen for incoming messages
	msg := ots.amqp.Consume(ots.config.ExchangeName, "direct", "q", "q")
	// based on message, do shit

    }
}

func (ots OTServer) Get (html string){
	//bold, italics, normal, line break
	for _, op := range ots.Ops {
		tag := string(op.Insert)
		if op.Attributes == nil {
			if tag == "\n" { //if just line break
				tag = "<br/>"
			} else { //normal text
				tag = fmt.Sprintf("<p>%s</p>", tag)
			}
		}
		else if { // if attributes exist
			value,exists := op.Attributes["bold"]
			if exists == true {
				tag = fmt.Sprintf("<strong>%s</strong>", tag)
			}
			value,exists = op.Attributes["italic"]
			if exists == true {
				tag = fmt.Sprintf("<em>%s</em>", tag)
			}
		}
		//replace all occurences of \n
		strings.Replace(tag, "\n", "<br/>", -1)
		html += tag
	}
	return
}
