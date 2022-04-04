package ot

import (
	"final"
	"final/internal/rbmq"
	"final/internal/store"
	"final/internal/util"
	"fmt"
	"strings"
	"time"

	"github.com/fmpwizard/go-quilljs-delta/delta"
	"github.com/xxuejie/go-delta-ot/ot"
)

type OTServer struct {
	config OTConfig
	docCache store.Repository[Document, uint32]
	docDb   store.Repository[Document, uint32]
	amqp   rbmq.RabbitMq
}

type Document struct {
	ID        uint32
	file 	  *ot.File
	// Kelvin: why do we have this?
	clientIds []string
}

func (d Document) Id() uint32 {
	return d.ID
}

func NewDocument(documentID uint32, clientID string) Document {
	document := Document{}
	//new document is just "\n"
	document.file = ot.NewFile(delta.Delta{[]delta.Op{delta.Op{Insert: []rune("\n")}}})
	document.ID = documentID
	document.clientIds = []string{clientID}
	return document
}

func NewOTServer(config OTConfig) OTServer {
	ots := OTServer{}
	ots.docCache = store.NewInMemoryStore[Document, uint32]()
	ots.docDb = store.NewMongoDbStore[Document, uint32](config.Db.Uri, config.Db.DbName, "documents", time.Minute)
	ots.amqp = rbmq.NewRabbitMq(config.AmqpUrl)
	return ots
}

func (ots OTServer) Start() {
	// start MultiFileServer
	// listen for incoming messages
	msgs := ots.amqp.Consume(ots.config.ExchangeName, "direct", "q", "q")

	for d := range msgs {
		msg, err := util.Deserialize[util.SessionOTMessage](d.Body)
		if err != nil {
			final.LogFatal(err, "oopsie woopsie")
		}
		if msg.DocumentId != 0 && msg.ClientId != "" && msg.Change.Version == 0 {
			//go func()
			ots.handleConnect(msg)
		} else if msg.DocumentId != 0 && msg.ClientId != "" && msg.Change.Version != 0 {
			ots.handleOp(msg)
		} else if msg.DocumentId != 0 && msg.ClientId == "" && msg.Change.Version == 0 {
			ots.handleGetDoc(msg)
		} else {
			final.LogFatal(err, "super oopsie woopsie fucky wucky")
		}
	}
}

// yes DocID, yes ClientID, no Change
func (ots OTServer) handleConnect(msg util.SessionOTMessage) {
		document := ots.docDb.FindById(msg.DocumentId)
		if document.ID == 0 { // if document does not exist
			document = NewDocument(msg.DocumentId, msg.ClientId)
		}
	response, err := util.Serialize(document.file.CurrentChange())
	if err != nil {
		final.LogError(err, "Could not deserialize document.")
	}
	err = ots.amqp.Publish(ots.config.ExchangeName, "direct", "newClient", string(response))
}

// yes DocID, yes ClientID, yes Change
func (ots OTServer) handleOp(msg util.SessionOTMessage) {
	// get document version number
	file := ots.docCache.FindById(msg.DocumentId).file
	version := file.CurrentChange().Version
	msg.Change.Version = version+1
	newChange, err := file.Submit(msg.Change)
	if err != nil {
		final.LogFatal(err, "failed to submit change")
	}
	newMsg := util.SessionOTMessage{
		msg.DocumentId,
		msg.ClientId,
		newChange,
	}
	msgBytes, err := util.Serialize[util.SessionOTMessage](newMsg)
	ots.amqp.Publish(ots.config.ExchangeName, "direct", "session", string(msgBytes))
}

// yes DocID, no ClientID, no Change
func (ots OTServer) handleGetDoc(msg util.SessionOTMessage) {
	response := ots.DocToHTML(msg.DocumentId)
	err = ots.amqp.Publish(ots.config.ExchangeName, "direct", "html", response)
}

// TODO : add database saving functionality

func (ots OTServer) DocToHTML(documentID uint32) (html string) {
	//bold, italics, normal, line break
	operations := ots.docCache.FindById(documentID).file.CurrentChange().Delta.Ops
	for _, op := range operations {
		tag := string(op.Insert)
		if op.Attributes == nil {
			if tag == "\n" { //if just line break
				tag = "<br/>"
			} else { //normal text
				tag = fmt.Sprintf("<p>%s</p>", tag)
			}
		} else { // if attributes exist
			_, exists := op.Attributes["bold"]
			if exists == true {
				tag = fmt.Sprintf("<strong>%s</strong>", tag)
			}
			_, exists = op.Attributes["italic"]
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
