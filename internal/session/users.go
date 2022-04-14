package session

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

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

	stored := ss.accDb.FindByKey("email", account.Email)
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
	email, err := EmailFrom(cookie.Value, ss.config.ClaimKey)
	if err != nil {
		ss.writeError(w, "Could not logout. Account not found.")
		return
	}
	// TODO
	// // Close the clients, by looping through the map of account -> client.
	acct, ok := ss.accCache.FindById(email)
	if ok {
		for _, client := range acct.Clients {
			client.LoggedOut <- true
		}
	}
	ss.accCache.DeleteById(email)
	http.SetCookie(w, &http.Cookie{
		Name:    "token",
		Value:   "",
		Expires: time.Now().Add(10 * time.Minute),
	})

	ss.writeOk(w, "")
}

func (ss SessionServer) handleUsersSignup(w http.ResponseWriter, r *http.Request) {
	account := Account{}
	json.NewDecoder(r.Body).Decode(&account)
	account.Verified = false
	stored := ss.accDb.FindByKey("email", account.Email)
	if stored.Email == account.Email { // maybe I only have to check if its not empty?
		ss.writeError(w, "Account already exists with that email.")
		return
	}
	if err := account.HashPassword(); err != nil {
		ss.writeError(w, "Internal error: failed to hash password.")
		return
	}
	if err := ss.accDb.Store(account); err != nil {
		ss.writeError(w, "Internal error: could not store new account.")
		return
	}
	if err := account.SendVerificationEmail(ss.config.VerifyKey, ss.config.Hostname); err != nil {
		ss.writeError(w, err.Error())
		return
	}

	ss.writeOk(w, "")
}

func (ss SessionServer) handleUsersVerify(w http.ResponseWriter, r *http.Request) {
	verifyKey := r.URL.Query()["key"]
	if len(verifyKey) == 1 {
		email, err := EmailFrom(verifyKey[0], ss.config.VerifyKey)
		if err != nil {
			ss.writeError(w, "Invalid verification key.")
			return
		}
		stored, exists := ss.accDb.FindById(email)
		if !exists {
			ss.writeError(w, "Database error. I hope you aren't hacking us.")
			return
		}
		stored.Verified = true
		err = ss.accDb.Store(stored)
		if err != nil {
			ss.writeError(w, "Could not update verification status.")
			return
		}
	} else {
		ss.writeError(w, "Malformed input.")
		return
	}
}
