package session

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"final"
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

	stored, err := ss.accDb.FindByKey("email", account.Email)
	if err != nil {
		ss.writeError(w, "Account not found")
		return
	}

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
	}{Name: stored.Name})
}

func (ss SessionServer) handleUsersLogout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("token")
	if err != nil {
		ss.writeError(w, "Not logged in.")
		return
	}
	email, err := IdFrom(cookie.Value, ss.config.ClaimKey)
	if err != nil {
		ss.writeError(w, "Could not logout. Account not found.")
		return
	}
	// TODO
	// // Close the clients, by looping through the map of account -> client.
	acct, err := ss.accCache.FindById(email)
	if err == nil {
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
	account := NewAccount()
	json.NewDecoder(r.Body).Decode(&account)
	account.Verified = false
	// Don't check error value here, since anything will get caught below.
	// No documents found: stored.Email != account.Email
	// Anything else: stored.Email != account.Email
	stored, _ := ss.accDb.FindByKey("email", account.Email)
	if stored.Email == account.Email { // maybe I only have to check if its not empty?
		ss.writeError(w, "Account already exists with that email.")
		return
	}
	if err := account.HashPassword(); err != nil {
		ss.writeError(w, "Internal error: failed to hash password.")
		return
	}
	final.LogDebug(nil, account.Password)
	if err := ss.accDb.Store(account); err != nil {
		ss.writeError(w, "Internal error: could not store new account.")
		return
	}
	smtpCfg := ss.config.Smtp
	verifyKey := hex.EncodeToString(md5.New().Sum([]byte(account.Email + ss.config.VerifyKey)))
	ss.verifyKeys[verifyKey] = account.Id()
	err := account.SendVerificationEmail(verifyKey, smtpCfg.Name, smtpCfg.Identity,
		smtpCfg.Username, smtpCfg.Password, smtpCfg.Host)
	if err != nil {
		ss.writeError(w, err.Error())
		return
	}

	ss.writeOk(w, "Signed up.")
}

func (ss SessionServer) handleUsersVerify(w http.ResponseWriter, r *http.Request) {
	verifyKey := r.URL.Query()["key"]
	if len(verifyKey) == 1 {
		accountId, exists := ss.verifyKeys[verifyKey[0]]
		if !exists {
			ss.writeError(w, "Invalid verification key.")
			return
		}
		stored, err := ss.accDb.FindById(accountId)
		if err != nil {
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
