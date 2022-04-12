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
	"io/ioutil"
	"net/http"
	"strings"
	"time"

	"github.com/fmpwizard/go-quilljs-delta/delta"
	"github.com/streadway/amqp"
	"github.com/xxuejie/go-delta-ot/ot"
)

type AccountClient struct {
	AccountId string
	Clients   []*Client
}

func (ac AccountClient) Id() string {
	return ac.AccountId
}

type SessionServer struct {
	config       SessionConfig
	docs         store.Repository[SessionDocument, string]
	accts        store.Repository[Account, string]
	accCache     store.Repository[AccountClient, string]
	amqp         rbmq.Broker
	stoppingChan chan bool
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

// Given a util.Message, write appropriate server side events to all those who are editing the document.
func (ss SessionServer) consumeOTResponse(msg amqp.Delivery) {
	otMsg, err := util.Deserialize[util.Message](msg.Body)
	if err != nil {
		final.LogError(err, "Could not deserialize OT response.")
	}
	eventMsg := EventData{}
	if (otMsg.Change != ot.Change{}) {
		eventMsg.Op = *otMsg.Change.Delta
	} else {
		eventMsg.Presence = otMsg.Presence
	}
	doc, _ := ss.docs.FindById(fmt.Sprint(otMsg.DocumentID))
	for _, c := range doc.Clients {
		if c.Id() != otMsg.ClientID {
			c.Events <- &eventMsg
		} else {
			if (otMsg.Change != ot.Change{}) {
				c.Events <- &EventData{Ack: eventMsg.Op}
			} // don't send anything if presence
		}
	}
}

func (ss SessionServer) addCse356Header(w http.ResponseWriter) {
	w.Header().Add("X-CSE356", ss.config.Cse356Id)
}

func (ss SessionServer) addSSEHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Connection", "keep-alive")
}

func (ss SessionServer) writeError(w http.ResponseWriter, err string) {
	type respError struct {
		Error string `json:"error"`
	}
	// TODO maybe add logging?
	json.NewEncoder(w).Encode(respError{Error: err})
}

func parseRequestIDs(r *http.Request) (docID string, clientID string, mediaID string, err error) {
	split := strings.Split(r.URL.Path, "/")
	if strings.HasPrefix(r.URL.Path, "/media/access/") {
		mediaID = split[len(split)-1]
		return
	}
	if strings.HasPrefix(r.URL.Path, "/doc/edit/") {
		docID = split[len(split)-1]
		return
	}
	if strings.HasPrefix(r.URL.Path, "/doc/") {
		docID = split[len(split)-2]
		clientID = split[len(split)-1]
		return
	}
	err = errors.New("the request URL does not contain IDs to be parsed")
	return
}

func (ss SessionServer) LogRequestIn(w http.ResponseWriter, r *http.Request) {
	str := fmt.Sprintf("[%s][in] %s\n", r.Method, r.URL.Path)

	buf, bodyErr := ioutil.ReadAll(r.Body)
	if bodyErr != nil {
		final.LogError(bodyErr, "Could not deserialize body.")
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

	defer r.Body.Close() // TODO: is this necessary (docs are confusing)?
	// switch on the endpoints
	switch {
	case strings.HasPrefix(r.URL.Path, "/users/"):
		ss.handleUsers(w, r)
	case strings.HasPrefix(r.URL.Path, "/collection/"):
		ss.handleCollection(w, r)
	case strings.HasPrefix(r.URL.Path, "/media"):
		ss.handleMedia(w, r)
	case strings.HasPrefix(r.URL.Path, "/doc/"):
		ss.handleDoc(w, r)
	case strings.HasPrefix(r.URL.Path, "/home"):
		ss.handleHome(w, r)
	}
}

// Handle anything under /users
func (ss SessionServer) handleUsers(w http.ResponseWriter, r *http.Request) {
	switch {
	case strings.HasPrefix(r.URL.Path, "/users/login"):
		ss.handleUsersLogin(w, r)
	case strings.HasPrefix(r.URL.Path, "/users/logout"):
		ss.handleUsersLogout(w, r)
	case strings.HasPrefix(r.URL.Path, "/users/signup"):
		ss.handleUsersSignup(w, r)
	case strings.HasPrefix(r.URL.Path, "/users/verify"):
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
	if err := account.HashPassword(); err != nil {
		ss.writeError(w, "Internal error: failed to hash password.")
		return
	}
	if err := ss.accts.Store(account); err != nil {
		ss.writeError(w, "Internal error: could not store new account.")
		return
	}
	if err := account.SendVerificationEmail(ss.config.VerifyKey, ss.config.HostName); err != nil {
		ss.writeError(w, err.Error())
		return
	}
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

// Handle anything under /collection
func (ss SessionServer) handleCollection(w http.ResponseWriter, r *http.Request) {
	switch {
	case strings.HasPrefix(r.URL.Path, "/collection/create"):
		ss.handleCollectionCreate(w, r)
	case strings.HasPrefix(r.URL.Path, "/collection/delete"):
		ss.handleCollectionDelete(w, r)
	case strings.HasPrefix(r.URL.Path, "/collection/list"):
		ss.handleCollectionList(w, r)
	}
}

func (ss SessionServer) handleCollectionCreate(w http.ResponseWriter, r *http.Request) {
	// don't need to check existence. We do docID creation
	// check auth and that's it?
}

func (ss SessionServer) handleCollectionDelete(w http.ResponseWriter, r *http.Request) {

}

func (ss SessionServer) handleCollectionList(w http.ResponseWriter, r *http.Request) {

}

// Handle anything under /media
func (ss SessionServer) handleMedia(w http.ResponseWriter, r *http.Request) {
	switch {
	case strings.HasPrefix(r.URL.Path, "/media/upload"):
		// TODO
	case strings.HasPrefix(r.URL.Path, "/media/access"):
		// TODO
	}
}

// Handle anything under /doc
func (ss SessionServer) handleDoc(w http.ResponseWriter, r *http.Request) {
	switch {
	case strings.HasPrefix(r.URL.Path, "/doc/edit"):
		ss.handleDocEdit(w, r)
	case strings.HasPrefix(r.URL.Path, "/doc/connect"):
		ss.handleDocConnect(w, r)
	case strings.HasPrefix(r.URL.Path, "/doc/op"):
		ss.handleDocOp(w, r)
	case strings.HasPrefix(r.URL.Path, "/doc/presence"):
		ss.handleDocPresence(w, r)
	case strings.HasPrefix(r.URL.Path, "/doc/get"):
		ss.handleDocGet(w, r)
	}
}

func (ss SessionServer) handleDocConnect(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("token")
	if err != nil {
		ss.writeError(w, "Not logged in.")
		return
	}
	ss.addCse356Header(w)
	ss.addSSEHeaders(w)

	docID, clientID, _, err := parseRequestIDs(r)
	if err != nil {
		final.LogFatal(err, "parseRequestIDs failed")
	}
	doc, exists := ss.docs.FindById(docID)
	if !exists {
		ss.writeError(w, fmt.Sprintf("Document with ID %s does not exist", docID))
		return
	}

	// TODO: move this logic to create document
	// if !exists {
	// 	clientMap := make(map[string]Client)
	// 	presenceMap := make(map[string]util.Presence)
	// 	eventsChan := make(chan *EventData)
	// 	clientMap[clientID] = Client{
	// 		id:     clientID,
	// 		Events: eventsChan,
	// 	}
	// 	presenceMap[clientID] = Presence{}
	// 	newDoc := SessionDocument{
	// 		id:        docID,
	// 		Name:      "Untitled Document",
	// 		Clients:   clientMap,
	// 		Presences: presenceMap,
	// 	}
	// 	ss.docs.Store(newDoc)
	// 	doc = newDoc
	// 	newDocMsg := util.Message{
	// 		Command:    util.NewDoc,
	// 		DocumentID: docID,
	// 		ClientID:   clientID,
	// 		// Delta is just insert newline char, handled by ot server
	// 	}
	// 	newDocMsgBytes, err := util.Serialize(newDocMsg)
	// 	if err != nil {
	// 		final.LogFatal(err, "failed to serialize message")
	// 	}
	// 	ss.amqp.Publish(ss.config.ExchangeName, "direct", "ot1", string(newDocMsgBytes))
	// }

	client, exists := doc.Clients[clientID]
	// final.LogDebug(nil, fmt.Sprintf("Checked for client in storage. Exists: %t", exists))
	timeout := time.After(3 * time.Second) // If this client has not connected yet
	var sseData []byte
	// Run this in a go func so we can get the existsChan in a channel.
	// Chris: isn't the reason for go func bc retrieveFullDocument calls Consume and therefore is blocking?
	existsChan := make(chan []byte)
	go func() {
		final.LogDebug(nil, fmt.Sprintf("in go func, exists is %t", exists))
		if !exists {
			newClient := Client{
				id:     clientID,
				Events: make(chan *EventData),
			}
			doc.Clients[clientID] = newClient
			acct, err := IdFrom(cookie.Value, ss.config.ClaimKey)
			if err != nil {
				ss.writeError(w, "Account somehow doesn't exist")
				return
			}
			acctClients := ss.accCache.FindByKey("AccountId", acct.Id())
			acctClients.Clients = append(acctClients.Clients, &newClient)
			ss.accCache.Store(acctClients)
			sseData = ss.retrieveFullDocument(doc, clientID)
			existsChan <- sseData
			presenceBytes, err := util.Serialize(doc.Presences) // NOTE: we do not have to do this!!! see pizza
			if err != nil {
				final.LogFatal(err, "failed to serialize presences")
			}
			existsChan <- presenceBytes
		}
	}()

	for {
		// select the results.
		select {
		case msg := <-client.Events: // transformed op from OT, or presence change
			sseData, _ = util.Serialize(*msg)
			final.LogDebug(nil, fmt.Sprintf("[%s][out][op] %s %s", r.Method, r.URL.Path, sseData))
			fmt.Fprintf(w, "data: %s\n\n", sseData)
		case data := <-existsChan: // contents or presenceBytes
			final.LogDebug(nil, fmt.Sprintf("[%s][out][doc] %s %s", r.Method, r.URL.Path, sseData))
			fmt.Fprintf(w, "data: %s\n\n", data)
		case <-timeout:
		}
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
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
	sseData, _ := util.Serialize(EventData{
		Content: *sseMsg.Change.Delta,
		Version: sseMsg.Change.Version,
	})
	return sseData
}

func (ss SessionServer) handleDocEdit(w http.ResponseWriter, r *http.Request) {
	// TODO: like home, not sure what to do here. Maybe handle
}

func (ss SessionServer) handleDocOp(w http.ResponseWriter, r *http.Request) {
	_, err := r.Cookie("token")
	if err != nil {
		ss.writeError(w, "Not logged in.")
		return
	}
	docID, clientID, _, err := parseRequestIDs(r)
	if err != nil {
		final.LogFatal(err, "parseRequestIDs failed")
	}
	doc, exists := ss.docs.FindById(docID)
	if !exists || len(doc.Clients[clientID].Id()) == 0 { // NOTE: assumes no empty string client IDs
		ss.writeError(w, "doc or client does not exist")
		return
	}
	ss.LogRequestIn(w, r)

	if r.Method == http.MethodPost { // chris: lowkey why do we even need to check what method it is?
		type ClientChange struct {
			Version uint32      `json:"version"`
			Op      delta.Delta `json:"op"`
		}
		var op ClientChange
		err = json.NewDecoder(r.Body).Decode(&op) // TODO: not sure if this decodes correctly
		if err != nil {
			final.LogFatal(err, "json decoding into ClientChange failed")
		}
		change := ot.Change{
			Delta:   &op.Op,
			Version: op.Version,
		}
		msg := util.Message{
			Command:    util.NewChanges,
			DocumentID: docID,
			ClientID:   clientID,
			Change:     change,
		}
		msgBytes, err := util.Serialize(msg)
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
}

func (ss SessionServer) handleDocPresence(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("token")
	if err != nil {
		ss.writeError(w, "Not logged in.")
		return
	}
	docID, clientID, _, err := parseRequestIDs(r)
	if err != nil {
		final.LogFatal(err, "parseRequestIDs failed")
	}
	doc, exists := ss.docs.FindById(docID)
	if !exists || len(doc.Clients[clientID].Id()) == 0 { // NOTE: assumes no empty string client IDs
		ss.writeError(w, "doc or client does not exist")
		return
	}
	ss.LogRequestIn(w, r)
	acct, err := IdFrom(cookie.Value, ss.config.ClaimKey)
	if err != nil {
		ss.writeError(w, "Account not found.")
		return
	}
	acct, exists = ss.accts.FindById(acct.Id())
	if !exists {
		final.LogFatal(nil, fmt.Sprintf("Account with ID %s not in ss.accts", acct.Id()))
	}
	cursor := util.Cursor{}
	json.NewDecoder(r.Body).Decode(&cursor)
	cursor.Name = acct.Username
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
}

func (ss SessionServer) handleDocGet(w http.ResponseWriter, r *http.Request) {
	_, err := r.Cookie("token")
	if err != nil {
		ss.writeError(w, "Not logged in.")
		return
	}
	docID, clientID, _, err := parseRequestIDs(r)
	if err != nil {
		final.LogFatal(err, "parseRequestIDs failed")
	}
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

func (ss SessionServer) handleHome(w http.ResponseWriter, r *http.Request) {
	// TODO: actually not sure what to do here.
}
