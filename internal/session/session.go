package session

import (
	"bytes"
	"encoding/json"
	"errors"
	"final"
	"final/internal/rbmq"
	"final/internal/store"
	"final/internal/util"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"strings"
	"time"

	"github.com/fmpwizard/go-quilljs-delta/delta"
	"github.com/streadway/amqp"
)

type AccountClient struct {
	AccountId string
	Clients   []*Client
}

func (ac AccountClient) Id() string {
	return ac.AccountId
}

type SessionServer struct {
	config         SessionConfig
	docs           store.Repository[SessionDocument, string]
	accts          store.Repository[Account, string]
	accCache       store.Repository[AccountClient, string]
	amqp           rbmq.Broker
	stoppingChan   chan bool
}

func NewSessionServer(config SessionConfig) (ss SessionServer) {
	ss = SessionServer{}
	ss.config = config
	// TODO: discuss memory store vs mongodb. Why not do it all in memory?
	ss.docs = store.NewInMemoryStore[SessionDocument, string]()
	ss.accts = store.NewMongoDbStore[Account, string](ss.config.Db.Uri, ss.config.Db.DbName, "accounts", time.Minute)
	ss.accCache = store.NewInMemoryStore[AccountClient, string]()
	ss.amqp = rbmq.NewRabbitMq(ss.config.AmqpUrl)
	ss.stoppingChan = make(chan bool)
	return
}

// Given a message containing the document id, client id, and transformed change,
// write appropriate server side events to all those who are editing the document.
func (ss SessionServer) consumeOTResponse(msg amqp.Delivery) {
	// TODO Do we need to check any info about the message?
	transformed, err := util.Deserialize[util.Message](msg.Body)
	if err != nil {
		final.LogError(err, "Could not deserialize OT response.")
	}
	// TODO handle exists
	doc, _ := ss.docs.FindById(fmt.Sprint(transformed.DocumentID))
	for _, c := range doc.Clients {
		// write data to c if c.Id() is not transformed.clientID
		if c.Id() != transformed.ClientID {
			c.Events <- &EventData{Data: transformed.Delta}
		}
	}
}

// Listen for new OT transforms
func (ss SessionServer) Listen() {
	ch, responses := ss.amqp.Consume(ss.config.ExchangeName, "direct", "session", "session")
	defer ch.Close()

	stopping := false
	for !stopping {
		select {
		case <-ss.stoppingChan:
			stopping = true
		case msg := <-responses:
			final.LogDebug(nil, "Session received: "+string(msg.Body))
			// Do not run this in a goroutine, because we might have
			// successive changes to the same document which can
			// cause a race condition.
			ss.consumeOTResponse(msg)
		}
	}
	// I don't know of any cleanup.
	ss.stoppingChan <- true
}

func (ss SessionServer) addCse356Header(w http.ResponseWriter) {
	w.Header().Add("X-CSE356", ss.config.Cse356Id)
}

func (ss SessionServer) addSSEHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Connection", "keep-alive")
}

func (ss SessionServer) writeError(w http.ResponseWriter, error string) {
	type respError struct {
		Error string `json:"error"`
	}
	// TODO maybe add logging?
	json.NewEncoder(w).Encode(respError{Error: error})
}

func (ss SessionServer) LogRequestIn(w http.ResponseWriter, r *http.Request) {
	str := fmt.Sprintf("[%s][in] %s\n", r.Method, r.URL.Path)

	buf, bodyErr := ioutil.ReadAll(r.Body)
	if bodyErr != nil {
		final.LogError("Could not deserialize body.")
		return
	}
	rdr1 := ioutil.NopCloser(bytes.NewBuffer(buf))
	rdr2 := ioutil.NopCloser(bytes.NewBuffer(buf))

	str += fmt.Sprintf("[body] %q", rdr1)
	r.Body = rdr2
	final.LogDebug(nil, str)
}

func (ss SessionServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ss.addCse356Header(w)
	ss.LogRequestIn(w, r)

	defer r.Body.Close()
	// switch on the endpoints
	// ASSUMPTION: "connect", "op", "doc" not part of session id
	switch {
	case strings.Contains(r.URL.Path, "users/"):
		ss.handleUsers(w, r)
	case strings.Contains(r.URL.Path, "connect/"):
		ss.handleConnect(w, r)
	case strings.Contains(r.URL.Path, "op/"):
		ss.handleOp(w, r)
	case strings.Contains(r.URL.Path, "presence/"):
		ss.handlePresence(w, r)
	case strings.Contains(r.URL.Path, "doc/"):
		ss.handleDoc(w, r)
	}
}

// Handle anything under /users
func (ss SessionServer) handleUsers(w http.ResponseWriter, r *http.Request) {
	switch {
	case strings.Contains(r.URL.Path, "login/"):
		ss.handleUsersLogin(w, r)
	case strings.Contains(r.URL.Path, "logout/"):
		ss.handleUsersLogout(w, r)
	case strings.Contains(r.URL.Path, "signup/"):
		ss.handleUsersSignup(w, r)
	case strings.Contains(r.URL.Path, "verify/"):
		ss.handleUsersVerify(w, r)
	}
}

func (ss SessionServer) handleUsersLogin(w http.ResponseWriter, r *http.Request) {
	account := Account{}
	json.NewDecoder(r.Body).Decode(&account)

	stored := ss.accts.FindByKey("email", account.Email)
	if !stored.Verified {
		ss.writeError(w, "User is not verified.")
		return
	}
	if !account.TestPassword(stored) {
		ss.writeError(w, "Wrong password.")
		return
	}
	tokenString, err := account.CreateJwt(ss.config.ClaimKey)
	if err != nil {
		ss.writeError(w, "Internal error: could not generate session token.")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:    "token",
		Value:   tokenString,
		Expires: time.Now().Add(10 * time.Minute),
	})
	// Write the account name in response.
	json.NewEncoder(w).Encode(struct {
		Name string `json:"name"`
	}{Name: account.Username})
}

func (ss SessionServer) handleUsersLogout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("token")
	if err != nil {
		ss.writeError(w, "Not logged in.")
		return
	}
	account, err := IdFrom(cookie.Value, ss.config.ClaimKey)
	if err != nil {
		ss.writeError(w, "Could not logout. Account not found.")
		return
	}
	// TODO
	// // Close the clients, by looping through the map of account -> client.
	acct, ok := ss.accCache.FindById(account.Email)
	if ok {
		for _, client := range acct.Clients {
			client.LoggedOut <- true
		}
	}
	ss.accCache.DeleteById(account.Id())
	http.SetCookie(w, &http.Cookie{
		Name:    "token",
		Value:   "",
		Expires: time.Now().Add(10 * time.Minute),
	})
}

func (ss SessionServer) handleUsersSignup(w http.ResponseWriter, r *http.Request) {
	account := Account{}
	json.NewDecoder(r.Body).Decode(&account)
	account.Verified = false
	stored := ss.accts.FindByKey("email", account.Email)
	if stored.Email == account.Email { // maybe I only have to check if its not empty?
		ss.writeError(w, "Account already exists with that email.")
		return
	}
	if err := ss.accts.Store(account); err != nil {
		ss.writeError(w, "Internal error: could not store new account.")
		return
	}
	verifyString, err := account.CreateJwt(ss.config.VerifyKey)
	if err != nil {
		ss.writeError(w, "Internal error: could not generate session token.")
		return
	}
	// emailContent := fmt.Sprintf("https://%s/users/verify?key=%s", ss.config.HostName, verifyString)
	fmt.Sprintf("https://%s/users/verify?key=%s", ss.config.HostName, verifyString)
	// TODO write the email with SMTP to postfix: https://gist.github.com/jniltinho/d90034994f29d7d25e59c9e0fe5548d2
}

func (ss SessionServer) handleUsersVerify(w http.ResponseWriter, r *http.Request) {
	verifyKey := r.URL.Query()["key"]
	if len(verifyKey) == 1 {
		account, err := IdFrom(verifyKey[0], ss.config.VerifyKey)
		if err != nil {
			ss.writeError(w, "Invalid verification key.")
			return
		}
		stored, exists := ss.accts.FindById(account.Id())
		if !exists {
			ss.writeError(w, "Database error. I hope you aren't hacking us.")
			return
		}
		stored.Verified = true
		err = ss.accts.Store(stored)
		if err != nil {
			ss.writeError(w, "Could not update verification status.")
			return
		}
	} else {
		ss.writeError(w, "Malformed input.")
		return
	}
}

// Get the entire document as a []byte to send back to the client over SSE.
func (ss SessionServer) retrieveFullDocument(doc SessionDocument, clientID string) []byte {
	// First, create the serialized data to send to the OT server.
	msg, err := util.Serialize(util.Message{
		Command:    util.GetDoc,
		DocumentID: doc.Id(), // NEXT Milestone 2
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
	sseData, _ := util.Serialize(EventData{Data: struct {
		Content any `json:"content"`
	}{Content: sseMsg.Delta}})
	return sseData
}

// Parse clientID from r
func clientIDFromRequest(r *http.Request) string {
	lastSlash := strings.LastIndex(r.URL.Path, "/")
	return r.URL.Path[lastSlash+1:]
}

func docIDFromRequest(r *http.Request) string {
	return "1"
}

func (ss SessionServer) handleConnect(w http.ResponseWriter, r *http.Request) {
	ss.addCse356Header(w)
	ss.addSSEHeaders(w)

	clientID := clientIDFromRequest(r)
	docID := docIDFromRequest(r)
	doc, exists := ss.docs.FindById(docID)

	if !exists {
		clientMap := make(map[string]Client)
		presenceMap := make(map[string]Presence)
		eventsChan := make(chan *EventData)
		clientMap[clientID] = Client{
			id:     clientID,
			Events: eventsChan,
		}
		presenceMap[clientID] = Presence{}
		newDoc := SessionDocument{
			id:        docID,
			Name:      "Untitled Document",
			Clients:   clientMap,
			Presences: presenceMap,
		}
		ss.docs.Store(newDoc)
		doc = newDoc
		newDocMsg := util.Message{
			Command:    util.NewDoc,
			DocumentID: docID,
			ClientID:   clientID,
			// Delta is just insert newline char, handled by ot server
		}
		newDocMsgBytes, err := util.Serialize(newDocMsg)
		if err != nil {
			final.LogFatal(err, "failed to serialize message")
		}
		ss.amqp.Publish(ss.config.ExchangeName, "direct", "ot1", string(newDocMsgBytes))
	}

	// doc does exist, go thru new client flow if we can't find in doc.Clients
	client, exists := doc.Clients[clientID]
	// final.LogDebug(nil, fmt.Sprintf("Checked for client in storage. Exists: %t", exists))
	timeout := time.After(3 * time.Second) // If this client has not connected yet
	var sseData []byte
	// Run this in a go func so we can get the existsChan in a channel.
	// Chris: isn't the reason for go func bc retrieveFullDocument calls Consume and therefore is blocking?
	existsChan := make(chan []byte)
	go func() {
		final.LogDebug(nil, fmt.Sprintf("in go func, exists is %t", exists))
		if !exists { // pass in contents delta, then presence data of ALL existing clients
			sseData = ss.retrieveFullDocument(doc, clientID)
			doc.Clients[clientID] = Client{
				id:     clientID,
				Events: make(chan *EventData),
			}
			existsChan <- sseData
			presenceBytes, err := util.Serialize(doc.Presences)
			if err != nil {
				final.LogFatal(err, "failed to serialize presences")
			}
			existsChan <- presenceBytes
		}
	}()
	// select the results.
	select {
	case msg := <-client.Events: // transformed op from OT, or presence change
		sseData, _ = util.Serialize(*msg)
		final.LogDebug(nil, fmt.Sprintf("[%s][out][op] %s %s", r.Method, r.URL.Path, sseData))
		fmt.Fprintf(w, "%s", sseData)
	case data := <-existsChan: //
		final.LogDebug(nil, fmt.Sprintf("[%s][out][doc] %s %s", r.Method, r.URL.Path, sseData))
		fmt.Fprintf(w, "%s", data)
	case <-timeout:
	}

	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

func logRequest(w http.ResponseWriter, r *http.Request) (io.ReadCloser, error) {
	buf2, bodyErr2 := ioutil.ReadAll(r.Body)
	if bodyErr2 != nil {
		return nil, errors.New("failed to read request body")
	}
	rdr1 := ioutil.NopCloser(bytes.NewBuffer(buf2))
	rdr2 := ioutil.NopCloser(bytes.NewBuffer(buf2))
	final.LogDebug(nil, fmt.Sprintf("[in][%s] %s Body: %s", r.Method, r.URL.Path, rdr1))
	return rdr2, bodyErr2
}

func (ss SessionServer) handlePresence(w http.ResponseWriter, r *http.Request) {
	clientID := clientIDFromRequest(r)
	docID := docIDFromRequest(r)
	doc, exists := ss.docs.FindById(docID)
	if !exists || len(doc.Clients[clientID].Id()) == 0 { // NOTE: assumes no empty string client IDs
		ss.handleConnect(w, r)
		return
	}
	body, err := logRequest(w, r)
	r.Body = body
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	presence := Presence{}
	json.NewDecoder(body).Decode(&presence)
	for _, c := range doc.Clients {
		if c.Id() != clientID {
			c.Events <- &EventData{Data: presence}
		}
	}
}

func (ss SessionServer) handleOp(w http.ResponseWriter, r *http.Request) {
	clientID := clientIDFromRequest(r)
	docID := docIDFromRequest(r) // TODO: how to find out how to actually get docID
	doc, exists := ss.docs.FindById(docID)
	if !exists || len(doc.Clients[clientID].Id()) == 0 { // NOTE: assumes no empty string client IDs
		ss.handleConnect(w, r)
		return
	}
	body, err := logRequest(w, r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var msgs []util.Message
	if r.Method == http.MethodPost {
		var opsArray []delta.Delta
		json.NewDecoder(body).Decode(&opsArray) // TODO: need to double check this works (decoding into uninitialized slice)
		for i, op := range opsArray {
			msgs[i] = util.Message{
				Command:    util.NewChanges,
				DocumentID: docID,
				ClientID:   clientID,
				Delta:      op,
			}
		}
	}
	msgBytes, err := util.Serialize(msgs)
	if err != nil {
		final.LogError(err, "Could not serialize sent op.")
	}
	final.LogDebug(nil, fmt.Sprintf("[session -> ot1][%s] %s %s", r.Method, r.URL.Path, msgBytes))
	ch, err := ss.amqp.Publish(ss.config.ExchangeName, "direct", "ot1", string(msgBytes))
	if err != nil {
		final.LogError(err, "Could not publish op to amqp.")
	}
	defer ch.Close()
}

func (ss SessionServer) handleDoc(w http.ResponseWriter, r *http.Request) {
	clientID := clientIDFromRequest(r)
	docID := docIDFromRequest(r) // TODO: again, this is dummy function
	msg := util.Message{
		Command:    util.GetHTML,
		DocumentID: docID,
		ClientID:   clientID,
	}
	if r.Method == http.MethodGet {
		msgBytes, err := util.Serialize(msg)
		if err != nil {
			final.LogError(err, "Could not serialize sent op.")
		}
		ch, err := ss.amqp.Publish(ss.config.ExchangeName, "direct", "ot1", string(msgBytes))
		if err != nil {
			final.LogFatal(err, "smth went very wrong publishing")
		}
		defer ch.Close()
		if err != nil {
			final.LogDebug(err, "could not publish in handleDoc")
		}

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
