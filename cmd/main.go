package main

import (
	"encoding/json"
	"final"
	"final/internal/store"
	"final/internal/util"
	"fmt"
	"net/http"
	"strings"
	// "time"

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
	clients store.Repository[Client, string] // TODO: change store to 1 type param for M1?
	file    *ot.File
}

func newSessionServer() Server {
	s := Server{}
	s.clients = store.NewInMemoryStore[Client, string]()
	s.file = ot.NewFile(*delta.New(nil))
	return s
}

func (s Server) addCse356Header(w http.ResponseWriter) {
	w.Header().Add("X-CSE356", "61f9d48d3e92a433bf4fc893")
}

func (s Server) addSSEHeaders(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
}

func (s Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.addCse356Header(w)
	defer r.Body.Close()
	// switch on the endpoints
	// ASSUMPTION: "connect", "op", "doc" not part of session id
	switch {
	case strings.Contains(r.URL.Path, "connect/"):
		s.handleConnect(w, r)
	case strings.Contains(r.URL.Path, "op/"):
		final.LogDebug(nil, fmt.Sprintf("[%s][in] %s", r.Method, r.URL.Path))
		s.handleOp(w, r)
	case strings.Contains(r.URL.Path, "doc/"):
		final.LogDebug(nil, fmt.Sprintf("[%s][in] %s", r.Method, r.URL.Path))
		s.handleDoc(w, r)
	}
}

// Parse ClientID from r
func clientIdFromRequest(r *http.Request) string {
	lastSlash := strings.LastIndex(r.URL.Path, "/")
	return r.URL.Path[lastSlash+1:]
}

func (s Server) handleConnect(w http.ResponseWriter, r *http.Request) {

	flusher, ok := w.(http.Flusher)
	if !ok {
		final.LogError(nil, "")
	}

	s.addSSEHeaders(w)

	// get existing client or create and store new one
	clientID := clientIdFromRequest(r)
	cli, exists := s.clients.FindById(clientID)

	// If our client doesn't exist, we need to send over the entire delta.
	if !exists {
		// But first, we make the new client.
		newCli := Client{
			id:     clientID,
			Events: make(chan *EventData),
		}
		s.clients.Store(newCli)
		cli = newCli
		content := struct {
			Content any `json:"content"`
		}{
			Content: s.file.CurrentChange().Delta.Ops,
		}
		resp, err := util.Serialize(EventData{Data: content})
		if err != nil {
			final.LogFatal(err, "failed to serialize EventData")
		}
		final.LogDebug(nil, fmt.Sprintf("[%s][out][new] %s %s", r.Method, r.URL.Path, resp))
		fmt.Fprintf(w, "data: %s\n\n", resp[:len(resp)-1])
		flusher.Flush()
	} else {
		// If this does exist, we need to do server-sent events (SSE).

		// First, we setup the timeout.
		// timeout := time.After(3 * time.Second)

		// Second, select on the channels.
		final.LogDebug(nil, fmt.Sprintf("[%s][out][op] %s waiting for events", r.Method, r.URL.Path))
		select {
		// Do we have a new SSE thing to send?
		case msg := <-cli.Events:
			resp, err := util.Serialize(*msg)
			if err != nil {
				final.LogFatal(err, "Could not deserialize eventData")
			}
			final.LogDebug(nil, fmt.Sprintf("[%s][out][op] %s %s", r.Method, r.URL.Path, resp[:len(resp)-1]))
			fmt.Fprintf(w, "data: %s\n\n", resp[:len(resp)-1])
			flusher.Flush()
			// // Or did we time out?
			// case <-timeout:
		}
	}

}

func (s Server) handleOp(w http.ResponseWriter, r *http.Request) {
	clientId := clientIdFromRequest(r)

	if r.Method == http.MethodPost {
		// submit change to s.file
		deltas := [][]delta.Op{}
		json.NewDecoder(r.Body).Decode(&deltas)
		for _, opList := range deltas {
			newChange := ot.Change{
				Version: s.file.CurrentChange().Version,
				Delta:   delta.New(opList),
			}
			s.file.Submit(newChange)

			deltaBytes, _ := util.Serialize(s.file.CurrentChange().Delta)
			final.LogDebug(nil, fmt.Sprintf("internal: new file %s", deltaBytes))

			// : how to send resp to all channels that are not clientId?
			resp := EventData{Data: newChange.Delta.Ops} // script expects ARRAY of oplists?

			// For each client...
			for _, client := range s.clients.FindAll() {
				final.LogDebug(nil, fmt.Sprintf("sending delta to %s", client.Id()))
				// if its not the client that sent the event.
				if client.Id() != clientId {
					// dispatch it
					client.Events <- &resp
				}
			}
		}
	}
}

func (s Server) handleDoc(w http.ResponseWriter, r *http.Request) {
	docOpsBytes, err := util.Serialize(s.file.CurrentChange().Delta)
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
