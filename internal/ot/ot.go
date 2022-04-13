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
	ID      string
	file    *ot.File
	Cursors map[string]util.Cursor
	// Kelvin: why do we have this? Chris: starting to agree why do we have this lmao
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
	// TODO: find out why forever channel is here?
	// forever := make(chan bool)
	// <-forever
	for {
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
}

// Creates new document with given document ID and stores it in cache and db
func (ots OTServer) handleNewDoc(msg util.Message) {
	document := Document{}
	document.file = ot.NewFile(delta.Delta{[]delta.Op{delta.Op{Insert: []rune("\n")}}}) //new document is just "\n"
	document.ID = msg.DocumentID
	err := ots.docCache.Store(document)
	if err != nil {
		final.LogFatal(err, "Could not store new document in cache")
	}
	err = ots.docDb.Store(document)
	if err != nil {
		final.LogFatal(err, "Could not store new document in db")
	}
	final.LogDebug(nil, fmt.Sprintf("stored new document with ID: %s", msg.DocumentID))
}

// publishes transformed delta to amqp 'session' key
func (ots OTServer) handleNewChange(msg util.Message) {
	// incoming msg either a delta or a presence update
	doc, exists := ots.docCache.FindById(msg.DocumentID)
	if !exists {
		final.LogFatal(nil, fmt.Sprintf("Document with ID %s not found in cache", msg.DocumentID))
	}
	if (msg.Change != ot.Change{}) { // we have a delta to transform and send back (+ update presences)
		newChange, err := doc.file.Submit(msg.Change)
		if err != nil {
			final.LogFatal(err, "failed to submit change")
		}
		newMsg := util.Message{
			DocumentID: msg.DocumentID,
			ClientID:   msg.ClientID,
			Change:     newChange,
		}
		msgBytes, _ := util.Serialize(newMsg)
		ch, err := ots.amqp.Publish(ots.config.ExchangeName, "direct", "session", string(msgBytes))
		if err != nil {
			final.LogFatal(err, "failed to publish transform back to session")
		}
		defer ch.Close()
		// now transform all presences
		for key, p := range doc.Cursors {
			newIndex := newChange.Delta.TransformPosition(p.Index, key != msg.ClientID)
			newLength := newChange.Delta.TransformPosition(p.Index+p.Length, key != msg.ClientID) - newIndex
			newCursor := util.Cursor{Index: newIndex, Length: newLength}
			doc.Cursors[key] = newCursor
			newPresence := util.Presence{ID: key, Cursor: newCursor}
			pMsgBytes, err := util.Serialize(newPresence)
			if err != nil {
				final.LogFatal(err, "failed to serialize updated presence")
			}
			ch, err := ots.amqp.Publish(ots.config.ExchangeName, "direct", "session", string(pMsgBytes))
			if err != nil {
				final.LogFatal(err, "failed to publish presence back to session")
			}
			defer ch.Close()
		}
	} else if (msg.Presence != util.Presence{}) { // update presence data structure and send right back
		// TODO: so are we not transforming against anything???
		doc.Cursors[msg.ClientID] = msg.Presence.Cursor
		msgBytes, err := util.Serialize(msg.Presence)
		if err != nil {
			final.LogFatal(err, "failed to serialize presence")
		}
		ch, err := ots.amqp.Publish(ots.config.ExchangeName, "direct", "session", string(msgBytes))
		if err != nil {
			final.LogFatal(err, "failed to publish transform back to session")
		}
		defer ch.Close()
	}
}

// publishes contents delta to amqp 'newClient' key
func (ots OTServer) handleGetDoc(msg util.Message) {
	doc, exists := ots.docCache.FindById(msg.DocumentID)
	if !exists {
		final.LogFatal(nil, fmt.Sprintf("Document with ID %s not found in cache", msg.DocumentID))
	}
	msgBytes, err := util.Serialize(util.Message{
		DocumentID: msg.DocumentID,
		ClientID:   msg.ClientID,
		Change:     doc.file.CurrentChange(),
	})
	if err != nil {
		final.LogFatal(err, "failed to serialize message")
	}
	ch, err := ots.amqp.Publish(ots.config.ExchangeName, "direct", "newClient", string(msgBytes))
	if err != nil {
		final.LogFatal(err, "could not publish document contents to queue")
	}
	defer ch.Close()
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
	doc, exists := ots.docCache.FindById(documentID)
	if !exists {
		final.LogFatal(nil, fmt.Sprintf("Document with ID %s not found in cache", documentID))
	}
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
			if exists {
				tag = fmt.Sprintf("<strong>%s</strong>", tag)
			}
			_, exists = op.Attributes["italic"]
			if exists {
				tag = fmt.Sprintf("<em>%s</em>", tag)
			}
		}
		//replace all occurences of \n
		strings.Replace(tag, "\n", "<br/>", -1)
		html += tag
	}
	return
}
