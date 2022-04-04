package ot

import (
	"final"
	"final/internal/rbmq"
	"final/internal/util"
	"fmt"
	"strings"

	"github.com/fmpwizard/go-quilljs-delta/delta"
	"github.com/xxuejie/go-delta-ot/ot"
)

type OTServer struct {
	config     OTConfig
	docs       store.Repository[Document]
	amqp       rbmq.RabbitMq
	fileServer ot.MultiFileNewServer
}

type Document struct {
	contents  delta.Delta
	ID        string
	clientIds []string
}

func (d Document) Id() string {
	return d.ID
}

func NewOTServer(config OTConfig) OTServer {
	ots := OTServer{}
	ots.docs = store.NewMongoDBStore[Document]()
	ots.fileServer = ot.NewMultiFileServer()
	ots.amqp = rbmq.NewRabbitMq(config.AmqpUrl)
}

func (ots OTServer) Start() {
	// start MultiFileServer
	go func() {
		ots.fileServer.Start()
	}()

	// listen for incoming messages
	msgs := ots.amqp.Consume(ots.config.ExchangeName, "direct", "q", "q")

	for d := range msgs {
		msg, err := util.Deserialize[util.SessionOTMessage](d)
		if err != nil {
			final.LogFatal(err, "oopsie woopsie")
		}
		if msg.DocumentId != "" && msg.ClientId != "" && msg.MultiFileChange == nil {
			ots.handleConnect(msg)
		} else if msg.DocumentId != "" && msg.ClientId != "" && msg.MultiFileChange != nil {
			ots.handleOp(msg)
		} else if msg.DocumentId != "" && msg.ClientId == "" && msg.MultiFileChange == nil {
			ots.handleGetDoc(msg)
		} else {
			final.LogFatal(err, "super oopsie woopsie fucky wucky")
		}

	}
}

func (ots OTServer) handleConnect(msg util.SessionOTMessage) {
	// TODO
}

func (ots OTServer) handleOp(msg util.SessionOTMessage) {
	// TODO
}

func (ots OTServer) handleGetDoc(msg util.SessionOTMessage) {
	// TODO
}

func (ots OTServer) DocToHTML(html string) {
	//bold, italics, normal, line break
	for _, op := range ots.Ops {
		tag := string(op.Insert)
		if op.Attributes == nil {
			if tag == "\n" { //if just line break
				tag = "<br/>"
			} else { //normal text
				tag = fmt.Sprintf("<p>%s</p>", tag)
			}
		} else { // if attributes exist
			value, exists := op.Attributes["bold"]
			if exists == true {
				tag = fmt.Sprintf("<strong>%s</strong>", tag)
			}
			value, exists = op.Attributes["italic"]
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
