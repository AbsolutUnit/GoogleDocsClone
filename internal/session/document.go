package session

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"final"
	"final/internal/util"

	"github.com/fmpwizard/go-quilljs-delta/delta"
	"github.com/xxuejie/go-delta-ot/ot"
)

// Handle anything under /doc
func (ss SessionServer) handleDoc(accountId string, w http.ResponseWriter, r *http.Request) {
	switch {
	case strings.HasPrefix(r.URL.Path, "/doc/edit"):
		ss.handleDocEdit(w, r)
	case strings.HasPrefix(r.URL.Path, "/doc/connect"):
		ss.handleDocConnect(accountId, w, r)
	case strings.HasPrefix(r.URL.Path, "/doc/op"):
		ss.handleDocOp(accountId, w, r)
	case strings.HasPrefix(r.URL.Path, "/doc/presence"):
		ss.handleDocPresence(accountId, w, r)
	case strings.HasPrefix(r.URL.Path, "/doc/get"):
		ss.handleDocGet(w, r)
	}
}

// Start Delta event stream connection to server.
// Request: {}
// Response: SSE Events
func (ss SessionServer) handleDocConnect(accountId string, w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		ss.writeError(w, "Streaming unsupported.")
		return
	}

	// Setup the SSE connection.
	ss.addSSEHeaders(w)

	// Parse the request URL.
	docID, clientID, _, err := parseRequestIDs(r)
	if err != nil {
		ss.writeError(w, "Could not parse request ids.")
		return
	}

	doc, err := ss.docs.FindById(docID)
	if err != nil {
		ss.writeError(w, fmt.Sprintf("Document ID %s does not exist", docID))
		return
	}

	acc, err := ss.accDb.FindById(accountId)
	if err != nil {
		ss.writeError(w, "Internal error: could not get account.")
		return
	}
	// Make a new client every time. We assume that if the connection closes, then we don't know for how long, and we should send over the entire document again.
	client := Client{
		id:      clientID,
		Events:  make(chan *EventData),
		Account: &acc,
	}
	doc.Clients[clientID] = client

	writeSseData := func(sseMsg *EventData) {
		sseData, err := util.Serialize(*sseMsg)
		if err != nil {
			ss.writeError(w, "Internal error: could not deserialize response.")
		}
		fmt.Fprintf(w, "data: %s\n\n", sseData)
		flusher.Flush()
	}

	// Get the entire document for sending, and write it first.
	docMsg := ss.retrieveFullDocument(doc, clientID)
	writeSseData(&docMsg)
	for {
		// Transformed op from OT, or presence change
		sseMsg := <-client.Events
		writeSseData(sseMsg)
	}
}

// Get the entire document as an EventData to send back to the client over SSE.
func (ss SessionServer) retrieveFullDocument(doc SessionDocument, clientID string) EventData {
	// First, create the serialized data to send to the OT server.
	msg, err := util.Serialize(util.Message{
		Command:    util.GetDoc,
		DocumentID: doc.Id(),
		ClientID:   clientID,
	})
	if err != nil {
		final.LogError(err, "Could not serialize message to OT server.")
	}
	// Send the message to the OT server.
	ch, err := ss.amqp.Publish(ss.config.ExchangeName, "direct", "ot1", string(msg))
	if err != nil {
		final.LogError(err, "Could not publish message to AMQP.")
	}
	defer ch.Close()

	ch, responses := ss.amqp.Consume(ss.config.ExchangeName, "direct", "", "newClient")
	defer ch.Close()
	if err != nil {
		final.LogError(err, "Could not consume message from OT server.")
	}
	sseMsg, err := util.Deserialize[util.Message]((<-responses).Body)
	if err != nil {
		final.LogError(err, "Could not deserialize message from OT server.")
	}
	return EventData{
		Content: sseMsg.Change.Delta.Ops,
		Version: sseMsg.Change.Version,
	}
}

func (ss SessionServer) handleDocEdit(w http.ResponseWriter, r *http.Request) {
	// TODO: like home, not sure what to do here. Maybe handle
}

// Submit a new Delta op for document with given version.
// URL: /doc/op/:docId/:clientId
// Request: { version, op }
// Response: { status }
func (ss SessionServer) handleDocOp(accountId string, w http.ResponseWriter, r *http.Request) {
	// Parse the request URL.
	docID, clientID, _, err := parseRequestIDs(r)
	if err != nil {
		ss.writeError(w, "Could not parse variables in request URL.")
		return
	}

	// Find the document/client the Op concerns.
	doc, err := ss.docs.FindById(docID)
	if err != nil {
		ss.writeError(w, "Document does not exist.")
		return
	}
	_, exists := doc.Clients[clientID]
	if !exists {
		ss.writeError(w, "Client does not exist.")
		return
	}

	// Parse the request body.
	var body struct {
		// This is a list of ops, since each op is actually only one of insert, retain, delete.
		Op      []delta.Op `json:"op"`
		Version uint32     `json:"version"`
	}
	err = json.NewDecoder(r.Body).Decode(&body)
	if err != nil {
		ss.writeError(w, "Invalid format for submitting a new op.")
		return
	}
	// if body.Version < doc.Version { //
	// 	ss.writeStatus(w, "retry")
	// 	return
	// }
	if body.Version > doc.Version { // for debugging
		final.LogFatal(nil, "incoming version greater than doc version")
	}

	// Convert the body into a change.
	change := ot.Change{
		Delta:   delta.New(body.Op),
		Version: body.Version,
	}
	msg := util.Message{
		Command:    util.NewChanges,
		DocumentID: docID,
		ClientID:   clientID,
		Change:     change,
	}
	msgBytes, err := util.Serialize(msg)
	if err != nil {
		ss.writeError(w, "Internal error. Could not serialize op to amqp.")
		return
	}
	final.LogDebug(nil, fmt.Sprintf("[session -> ot1][%s] %s %s", r.Method, r.URL.Path, msgBytes))
	ch, err := ss.amqp.Publish(ss.config.ExchangeName, "direct", "ot1", string(msgBytes))
	if err != nil {
		ss.writeError(w, "Internal error. Could not publish op to amqp.")
		return
	}
	defer ch.Close()
	doc.LastModified = time.Now()
	doc.Acks <- &body.Op
	ss.writeStatus(w, "ok")
}

func (ss SessionServer) handleDocPresence(accountId string, w http.ResponseWriter, r *http.Request) {
	// Parse the request URL.
	docID, clientID, _, err := parseRequestIDs(r)
	if err != nil {
		final.LogFatal(err, "parseRequestIDs failed")
	}
	doc, err := ss.docs.FindById(docID)
	if err != nil {
		ss.writeError(w, "Document does not exist.")
		return
	}
	if _, exists := doc.Clients[clientID]; !exists {
		ss.writeError(w, "Client does not exist.")
		return
	}

	// Deserialize the request body.
	cursor := util.Cursor{}
	json.NewDecoder(r.Body).Decode(&cursor)

	// Kelvin made the mistake of making Email the Account's ID, so now he and we have to live with it.
	// Really though, it comes from the Model interface using Id() meaning the field can't be called Id.
	acct, err := ss.accDb.FindById(accountId)
	if err != nil {
		final.LogFatal(nil, fmt.Sprintf("Account with ID %s not in ss.accts", acct.Id()))
	}
	cursor.Name = acct.Name

	presence := util.Presence{
		ID:     clientID,
		Cursor: cursor,
	}
	msg := util.Message{
		Command:    util.NewChanges,
		DocumentID: docID,
		ClientID:   clientID,
		Presence:   presence,
	}
	msgBytes, err := util.Serialize(msg)
	if err != nil {
		final.LogError(err, "Could not serialize sent presence.")
	}
	final.LogDebug(nil, fmt.Sprintf("[session -> ot1][%s] %s %s", r.Method, r.URL.Path, msgBytes))
	ch, err := ss.amqp.Publish(ss.config.ExchangeName, "direct", "ot1", string(msgBytes))
	if err != nil {
		final.LogError(err, "Could not publish presence to amqp.")
	}
	defer ch.Close()

	ss.writeOk(w, "")
}

func (ss SessionServer) handleDocGet(w http.ResponseWriter, r *http.Request) {
	docID, clientID, _, err := parseRequestIDs(r)
	if err != nil {
		ss.writeError(w, "Could not parse variables in request URL.")
		return
	}
	msg := util.Message{
		Command:    util.GetHTML,
		DocumentID: docID,
		ClientID:   clientID,
	}
	// TODO Kelvin was here about to read this.
	if r.Method == http.MethodGet {
		msgBytes, err := util.Serialize(msg)
		if err != nil {
			final.LogError(err, "Could not serialize sent op.")
		}
		ch, err := ss.amqp.Publish(ss.config.ExchangeName, "direct", "ot1", string(msgBytes))
		if err != nil {
			final.LogDebug(err, "could not publish in handleDocGet")
		}
		defer ch.Close()

		timeout := time.After(10 * time.Second)
		ch, response := ss.amqp.Consume(ss.config.ExchangeName, "direct", "", "html")
		defer ch.Close()

		select {
		case <-timeout:
			final.LogError(nil, "Timed out waiting for HTML response.")
		case msgBytes := <-response:
			fmt.Fprint(w, msgBytes)
		}
	}
}
