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
	config   OTConfig
	docCache store.Repository[Document, string]
	docDb    store.Repository[Document, string]
	amqp     rbmq.Broker
}

type Document struct {
	ID   string
	file *ot.File
	// Kelvin: why do we have this?
	clientIds []string // NEXT: M2 keep track of which clients have access to this doc
}

func (d Document) Id() string {
	return d.ID
}

func NewOTServer(config OTConfig) OTServer {
	ots := OTServer{}
	ots.config = config
	ots.docCache = store.NewInMemoryStore[Document, string]()
	ots.docDb = store.NewMongoDbStore[Document, string](config.Db.Uri, config.Db.DbName, "documents", time.Minute)
	ots.amqp = rbmq.NewRabbitMq(config.AmqpUrl)
	return ots
}

func (ots OTServer) Start() {
	// forever := make(chan bool)
	// <-forever
	ch, msgs := ots.amqp.Consume(ots.config.ExchangeName, "direct", "", "ot1")
	defer ch.Close()
	for msgBytes := range msgs {
		msg, err := util.Deserialize[util.Message](msgBytes.Body)
		if err != nil {
			final.LogFatal(err, "failed to deserialize message")
		}
		switch msg.Command {
		case util.NewDoc:
			ots.handleNewDoc(msg)
		case util.NewChanges: // if clientID not recognized, go thru newClient flow as well
			ots.handleNewChange(msg)
		case util.GetDoc:
			ots.handleGetDoc(msg)
		case util.GetHTML:
			ots.handleGetHTML(msg)
		}

	}
}

// create new document and store it in ots
func (ots OTServer) CreateAndStoreDoc(documentID string, clientID string) Document {
	fmt.Println("DEBUG: called NewDocument")
	document := Document{}
	//new document is just "\n"
	document.file = ot.NewFile(delta.Delta{[]delta.Op{delta.Op{Insert: []rune("\n")}}})
	document.ID = documentID
	document.clientIds = []string{clientID}
	ots.docCache.Store(document)
	ots.docDb.Store(document)
	return document
}

// creates and stores new document, then publishes contents delta to 'newClient' key (new document implies new client)
func (ots OTServer) handleNewDoc(msg util.Message) {
	newDoc := ots.CreateAndStoreDoc(msg.DocumentID, msg.ClientID)
	msgBytes, err := util.Serialize(util.Message{
		DocumentID: msg.DocumentID,
		ClientID:   msg.ClientID,
		Delta:      *newDoc.file.CurrentChange().Delta,
	})
	if err != nil {
		final.LogFatal(err, "failed to serialize message")
	}
	ots.amqp.Publish(ots.config.ExchangeName, "direct", "newClient", string(msgBytes)) // TODO: double check routing key
}

// publishes transformed delta to amqp 'session' key
func (ots OTServer) handleNewChange(msg util.Message) {
	doc, _ := ots.docCache.FindById(msg.DocumentID)
	file := doc.file
	version := file.CurrentChange().Version
	// Chris: my dumb ass replaced msg.Change with msg.Delta, so create Change here
	change := ot.Change{
		Version: version,
		Delta:   &msg.Delta,
	}
	change.Version = version
	newChange, err := file.Submit(change)
	if err != nil {
		final.LogFatal(err, "failed to submit change")
	}
	newMsg := util.Message{
		DocumentID: msg.DocumentID,
		ClientID:   msg.ClientID,
		Delta:      *newChange.Delta,
	}
	// TODO: too lazy to error handle
	msgBytes, _ := util.Serialize(newMsg)
	ch, _ := ots.amqp.Publish(ots.config.ExchangeName, "direct", "session", string(msgBytes))
	defer ch.Close()
}

// publishes contents delta to amqp 'newClient' key
func (ots OTServer) handleGetDoc(msg util.Message) {
	doc, _ := ots.docCache.FindById(msg.DocumentID)
	msgBytes, err := util.Serialize(util.Message{
		DocumentID: msg.DocumentID,
		ClientID:   msg.ClientID,
		Delta:      *doc.file.CurrentChange().Delta,
	})
	if err != nil {
		final.LogFatal(err, "failed to serialize message")
	}
	ots.amqp.Publish(ots.config.ExchangeName, "direct", "newClient", string(msgBytes)) // TODO: double check routing key
}

// publishes html of doc to amqp 'html' key
func (ots OTServer) handleGetHTML(msg util.Message) {
	response := ots.DocToHTML(msg.DocumentID)
	ch, err := ots.amqp.Publish(ots.config.ExchangeName, "direct", "html", response)
	if err != nil {
		final.LogFatal(err, "could not publish html to queue")
	}
	defer ch.Close()
}

// NOTE: https://github.com/dchenk/go-render-quill should be able to take care of this if we're having issues
func (ots OTServer) DocToHTML(documentID string) (html string) {
	//bold, italics, normal, line break
	// TODO handle exists
	doc, _ := ots.docCache.FindById(documentID)
	operations := doc.file.CurrentChange().Delta.Ops
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
