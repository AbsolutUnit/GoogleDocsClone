package main

import (
	"encoding/json"
	"final"
	"final/internal/store"
	"final/internal/util"
	"fmt"
	"net/http"
	"strings"

	quill "github.com/dchenk/go-render-quill"
	"github.com/fmpwizard/go-quilljs-delta/delta"
	"github.com/xxuejie/go-delta-ot/ot"
)

type EventData struct {
	Data any `json:"data"`
}

type Client struct {
	id     string
	Events chan *EventData
}

func (cli Client) Id() string {
	return cli.id
}

type Server struct {
	clients         store.Repository[Client, string] // TODO: change store to 1 type param for M1?
	file            ot.File
	fileInitialized bool
}

func newSessionServer() Server {
	s := Server{}
	s.clients = store.NewInMemoryStore[Client, string]()
	s.fileInitialized = false
	return s
}

func (s Server) addCse356Header(w http.ResponseWriter) {
	w.Header().Add("X-CSE356", "61f9d48d3e92a433bf4fc893")
}

func (s Server) addSSEHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Connection", "keep-alive")
}

func (s Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.addCse356Header(w)
	final.LogDebug(nil, fmt.Sprintf("[%s][in] %s", r.Method, r.URL.Path))
	defer r.Body.Close()
	// switch on the endpoints
	// ASSUMPTION: "connect", "op", "doc" not part of session id
	switch {
	case strings.Contains(r.URL.Path, "connect/"):
		s.handleConnect(w, r)
	case strings.Contains(r.URL.Path, "op/"):
		s.handleOp(w, r)
	case strings.Contains(r.URL.Path, "doc/"):
		s.handleDoc(w, r)
	}
}

// Parse ClientID from r
func clientIdFromRequest(r *http.Request) string {
	lastSlash := strings.LastIndex(r.URL.Path, "/")
	return r.URL.Path[lastSlash+1:]
}

func (s Server) handleConnect(w http.ResponseWriter, r *http.Request) {
	s.addSSEHeaders(w)

	// create new file if does not exist
	if !s.fileInitialized {
		s.file = *ot.NewFile(delta.Delta{[]delta.Op{delta.Op{Insert: []rune("\n")}}})
	}

	// get existing client or create and store new one
	clientID := clientIdFromRequest(r)
	cli := s.clients.FindById(clientID)
	if cli.id == "" {
		newCli := Client{
			clientID,
			make(chan *EventData),
		}
		s.clients.Store(newCli)
		cli = newCli
	}

	content := struct {
		Content any
	}{
		Content: s.file.CurrentChange().Delta,
	}
	resp, err := util.Serialize(EventData{Data: content})
	if err != nil {
		final.LogFatal(err, "failed to serialize EventData")
	}
	fmt.Printf("%s", resp)
	fmt.Fprintf(w, "%s", resp) // should we send back encoded as json instead?

	// TODO: how to send resp to all channels that are not clientId?

	// TODO: figure out where I'm supposed to flush???
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	// listen for transformed operation and send back to client
	for d := range cli.Events {
		fmt.Fprintf(w, "%s", d)            // should it be json?
		if f, ok := w.(http.Flusher); ok { // again, should we flush here?
			f.Flush()
		}
	}

}

func (s Server) handleOp(w http.ResponseWriter, r *http.Request) {
	// clientId := clientIdFromRequest(r)
	if r.Method == http.MethodPost {
		// submit change to s.file
		bodyDelta := delta.Delta{}
		json.NewDecoder(r.Body).Decode(&bodyDelta.Ops)
		change := ot.Change{
			Delta:   &bodyDelta,
			Version: s.file.CurrentChange().Version,
		}
		newChange, err := s.file.Submit(change)
		if err != nil {
			final.LogFatal(err, "submit failed")
		}

		// TODO: how to send resp to all channels that are not clientId?
		resp := EventData{Data: newChange.Delta} // script expects ARRAY of oplists?
		fmt.Printf("%v", resp)
	}
}

func (s Server) handleDoc(w http.ResponseWriter, r *http.Request) {
	docOpsBytes, err := util.Serialize(s.file.CurrentChange().Delta.Ops)
	if err != nil {
		final.LogFatal(err, "could not serialize delta ops")
	}
	html, err := quill.Render(docOpsBytes) // can render with different formatting rules if we want
	if err != nil {
		final.LogFatal(err, "failed to render ops as html")
	}
	fmt.Fprintf(w, "%s", html)
}

func main() {
	server := newSessionServer()
	err := http.ListenAndServe(":8080", server)
	if err != nil {
		final.LogFatal(err, "Failed to start server")
	}
}

