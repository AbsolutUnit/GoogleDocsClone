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
	docCache store.Repository[Document, uint32]
	docDb    store.Repository[Document, uint32]
	amqp     rbmq.RabbitMq
}

type Document struct {
	ID   uint32
	file *ot.File
	// Kelvin: why do we have this?
	clientIds []string // NEXT: M2 keep track of which clients have access to this doc
}

func (d Document) Id() uint32 {
	return d.ID
}

func NewDocument(documentID uint32, clientID string) Document {
	fmt.Println("DEBUG: called NewDocument")
	document := Document{}
	//new document is just "\n"
	document.file = ot.NewFile(delta.Delta{[]delta.Op{delta.Op{Insert: []rune("\n")}}})
	document.ID = documentID
	document.clientIds = []string{clientID}
	return document
}

func NewOTServer(config OTConfig) OTServer {
	ots := OTServer{}
	ots.config = config
	ots.docCache = store.NewInMemoryStore[Document, uint32]()
	ots.docDb = store.NewMongoDbStore[Document, uint32](config.Db.Uri, config.Db.DbName, "documents", time.Minute)
	ots.amqp = rbmq.NewRabbitMq(config.AmqpUrl)
	return ots
}

func (ots OTServer) Start() {
	go func() {
		final.LogDebug(nil, "listening for newClientOT")
		connectMsgs := ots.amqp.Consume(ots.config.ExchangeName, "direct", "", "newClientOT")
		for d := range connectMsgs {
			msg, err := util.Deserialize[util.SessionOTMessage](d.Body)
			if err != nil {
				final.LogFatal(err, "failed to deserialize msg from newClientOT queue")
			}
			final.LogDebug(nil, fmt.Sprintf("%s", d.Body))
			ots.handleConnect(msg)
		}
	}()

	go func() {
		final.LogDebug(nil, "listening for ot1")
		opMsgs := ots.amqp.Consume(ots.config.ExchangeName, "direct", "", "ot1")
		for d := range opMsgs {
			msg, err := util.Deserialize[util.SessionOTMessage](d.Body)
			if err != nil {
				final.LogFatal(err, "failed to deserialize msg from ot1 queue")
			}
			final.LogDebug(nil, fmt.Sprintf("%s", d.Body))
			ots.handleOp(msg)
		}
	}()

	go func() {
		fmt.Println("Debug GetDoc Gofunc")
		getDocMsgs := ots.amqp.Consume(ots.config.ExchangeName, "direct", "", "html")
		for d := range getDocMsgs {
			msg, err := util.Deserialize[util.SessionOTMessage](d.Body)
			if err != nil {
				final.LogFatal(err, "failed to deserialize msg from html queue")
			}
			final.LogDebug(nil, fmt.Sprintf("%s", d.Body))
			ots.handleGetDoc(msg)
		}
	}()
	forever := make(chan bool)
	<-forever
}

// yes DocID, yes ClientID, no Change
func (ots OTServer) handleConnect(msg util.SessionOTMessage) {
	fmt.Println("DEBUG: called handleConnect")
	document, exists := ots.docCache.FindById(msg.DocumentId)
	if !exists { // if document does not exist
		document = NewDocument(msg.DocumentId, msg.ClientId)
		ots.docDb.Store(document)
		ots.docCache.Store(document)
	}
	response, err := util.Serialize(document.file.CurrentChange())
	if err != nil {
		final.LogError(err, "Could not deserialize document.")
	}
	err = ots.amqp.Publish(ots.config.ExchangeName, "direct", "newClientSession", string(response))
	if err != nil {
		final.LogFatal(err, "publish to 'newClient' key failed")
	}
	fmt.Println("DEBUG: published to 'newClient' key")
}

// yes DocID, yes ClientID, yes Change
func (ots OTServer) handleOp(msg util.SessionOTMessage) {
	fmt.Println("DEBUG: called handleOp")
	// TODO handle exists
	doc, _ := ots.docCache.FindById(msg.DocumentId)
	file := doc.file
	version := file.CurrentChange().Version
	msg.Change.Version = version
	newChange, err := file.Submit(msg.Change)
	if err != nil {
		final.LogFatal(err, "failed to submit change")
	}
	newMsg := util.SessionOTMessage{
		msg.DocumentId,
		msg.ClientId,
		newChange,
	}
	msgBytes, err := util.Serialize(newMsg)
	err = ots.amqp.Publish(ots.config.ExchangeName, "direct", "session", string(msgBytes))
	if err != nil {
		final.LogFatal(err, "failed to publish to 'session' key")
	}
	fmt.Println("DEBUG: published to 'session' key")
}

// yes DocID, no ClientID, no Change
func (ots OTServer) handleGetDoc(msg util.SessionOTMessage) {
	fmt.Println("DEBUG: called handleGetDoc")
	response := ots.DocToHTML(msg.DocumentId)
	err := ots.amqp.Publish(ots.config.ExchangeName, "direct", "html", response)
	if err != nil {
		final.LogFatal(err, "could not publish html to queue")
	}
	fmt.Println("DEBUG: published to 'html' key")
}

func (ots OTServer) DocToHTML(documentID uint32) (html string) {
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
	fmt.Println("DEBUG: converted html: %v", html)
	return
}
