package ot

import (
	"final"
	"final/internal/rbmq"
	"final/internal/store"
	"final/internal/util"
	"fmt"
	"strconv"
	"strings"

	"github.com/fmpwizard/go-quilljs-delta/delta"
	"github.com/xxuejie/go-delta-ot/ot"
)

type OTServer struct {
	config OTConfig
	docs   store.Repository[Document, string]
	amqp   rbmq.RabbitMq
	File   ot.File
}

type Document struct {
	contents  delta.Delta
	ID        string
	clientIds []string
}

func (d Document) Id() string {
	return d.ID
}

func NewDocument(documentID string, clientID string) Document {
	document := Document{}
	//new document is just "\n"
	document.contents = delta.Delta{[]Op{Op{Insert: []rune("\n")}}}
	document.ID = documentID
	document.clientIds = []string{clientID}
	return document
}

func NewOTServer(config OTConfig) OTServer {
	ots := OTServer{}
	ots.docs = store.NewMongoDbStore[Document, string](config.Db)
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
		document := docs.FindById(msg.DocumentId)
		if document == nil { // if document does not exist
			document = NewDocument(msg.DocumentId, msg.ClientID)
		}
		// TODO : do I need to specify generic for Serialize?
		response := string(util.Serialize(document.contents))
		err = ots.amqp.Publish(ots.config.ExchangeName, "direct", "newClient", response)
}

// yes DocID, yes ClientID, yes Change
func (ots OTServer) handleOp(msg util.SessionOTMessage) {
	// get document version number
	version := ots.File.Version
	msg.Change.Version = version
	id, err := strconv.ParseUint(msg.ClientId, 10, 32)
	if err != nil {
		final.LogFatal(err, "error parsing client id into uint")
	}
	id = uint32(id)
	newChange, err := ots.File.Submit(id, msg.Change)
	if err != nil {
		final.LogFatal(err, "failed to submit change")
	}
	newMsg := util.SessionOTMessage{
		msg.DocumentId,
		msg.ClientId,
		newChange,
	}
	newMsg, err = util.Serialize[util.SessionOTMessage](newMsg)
	ots.amqp.Publish(ots.config.ExchangeName, "direct", "session", newMsg)
}

// yes DocID, no ClientID, no Change
func (ots OTServer) handleGetDoc(msg util.SessionOTMessage) {
	response := ots.DocToHTML(msg.DocumentID)
	err = ots.amqp.Publish(ots.config.ExchangeName, "direct", "html", response)
}

// TODO : add database saving functionality

func (ots OTServer) DocToHTML(documentID string) (html string) {
	//bold, italics, normal, line break
	operations := docs.FindById(documentID).contents.Ops
	for _, op := range operations {
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
