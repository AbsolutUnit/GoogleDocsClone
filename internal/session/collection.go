package session

import (
	"encoding/json"
	"final"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"final/internal/util"
)

type RespItems struct { // for getting top 10 docs
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Handle anything under /collection
func (ss SessionServer) handleCollection(accountId string, w http.ResponseWriter, r *http.Request) {
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

	// No need to handle error response.
	if count, err := ss.docs.DeleteById(body.DocId); err != nil || count == 0 {
		ss.writeError(w, fmt.Sprintf("Document ID %s could not be deleted.", body.DocId))
	} else if count > 0 {
		ss.writeOk(w, "Deleted document.")
	}
}

// Return a list of the most-recently modified 10 documents sorted in reverse chronological order.
// Expected request form: {}
// Expected response form: [{id, name}, ...]
func (ss SessionServer) handleCollectionList(w http.ResponseWriter, r *http.Request) {
	top10Resp := ss.GetTop10()
	top10RespBytes, err := util.Serialize(top10Resp)
	if err != nil {
		final.LogFatal(err, "failed to serialize top 10 response")
	}
	final.LogDebug(nil, fmt.Sprintf("top10RespBytes: %v", top10RespBytes))
	fmt.Fprint(w, top10RespBytes)
}

func (ss SessionServer) GetTop10() []RespItems {
	allDocs := ss.docs.FindAll()
	sort.Slice(allDocs, func(i, j int) bool {
		return allDocs[i].LastModified.After(allDocs[j].LastModified)
	})
	top10Docs := allDocs[:10]
	top10Resp := make([]RespItems, len(top10Docs))
	for i, k := range top10Docs {
		top10Resp[i] = RespItems{ID: k.Id(), Name: k.Name}
	}
	return top10Resp
}
