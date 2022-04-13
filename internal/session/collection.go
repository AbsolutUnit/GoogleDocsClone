package session

import (
	"encoding/json"
	"final/internal/util"
	"fmt"
	"net/http"
	"strings"
)

// Handle anything under /collection
func (ss SessionServer) handleCollection(email string, w http.ResponseWriter, r *http.Request) {
	switch {
	case strings.HasPrefix(r.URL.Path, "/collection/create"):
		ss.handleCollectionCreate(w, r)
	case strings.HasPrefix(r.URL.Path, "/collection/delete"):
		ss.handleCollectionDelete(w, r)
	case strings.HasPrefix(r.URL.Path, "/collection/list"):
		ss.handleCollectionList(w, r)
	}
}

// Create a new document.
// Expected request form: { name }
// Expected response: { docId }
func (ss SessionServer) handleCollectionCreate(w http.ResponseWriter, r *http.Request) {
	// Parse the incoming request.
	var body struct {
		Name string `json:"Name"`
	}
	err := json.NewDecoder(r.Body).Decode(&body)
	if err != nil {
		ss.writeError(w, "Invalid format for creating a new collection.")
		return
	}

	// Create the document in the session.
	newDoc := NewSessionDocument(ss.idFactory.Generate().String(), body.Name)
	ss.docs.Store(newDoc)
	// Create the document on the OT server.
	msg := util.Message{
		Command:    util.NewDoc,
		DocumentID: newDoc.Id(),
	}
	msgBytes, err := util.Serialize(msg)
	if err != nil {
		ss.writeError(w, "Could not create a new document.")
		return
	}
	ss.amqp.Publish(ss.config.ExchangeName, "direct", "ot1", string(msgBytes))

	// Respond to client.
	json.NewEncoder(w).Encode(struct {
		DocId string `json:"docid"`
	}{DocId: newDoc.Id()})
}

// Delete an existing document.
// Expected request form: { docId }
// Expected response: {}
func (ss SessionServer) handleCollectionDelete(w http.ResponseWriter, r *http.Request) {
	// Parse the incoming request.
	var body struct {
		DocId string `json:"docid"`
	}
	err := json.NewDecoder(r.Body).Decode(&body)
	if err != nil {
		ss.writeError(w, "Invalid format for deleting a collection.")
		return
	}

	// Check if it exists.
	_, exists := ss.docs.FindById(body.DocId)
	if !exists {
		ss.writeError(w, fmt.Sprintf("Document ID %s does not exist", body.DocId))
		return
	}

	// No need to handle error response.
	if _, err := ss.docs.DeleteById(body.DocId); err != nil {
		ss.writeError(w, fmt.Sprintf("Document ID %s could not be deleteed."))
		return
	}
}

// Return a list of the most-recently modified 10 documents sorted in reverse chronological order.
// Expected request form: {}
// Expected response form: [{id, name}, ...]
func (ss SessionServer) handleCollectionList(w http.ResponseWriter, r *http.Request) {
	// TODO
	// Check the store for the most recently modified documents.
	// Return data.
}
