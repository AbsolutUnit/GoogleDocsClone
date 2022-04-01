package auth

import (
	"github.com/bwmarrin/snowflake"
)

type Token struct {
	id    snowflake.ID
	token string
}

func (t Token) IdKey() string {
	return "id"
}

type Account struct {
	id       snowflake.ID
	Username string
	Password string
	Email    string
	Verified bool
}

func (a Account) Id() string {
	return a.id.String()
}

// Given an account with a hashed password, hash this account's password and compare the two.
func (a Account) TestPassword(account Account) (valid bool) {
	// bcrypt with cost factor 10
	return false
}

// Creates a JWT storing this accounts username given a key to sign it with
func (a Account) CreateJwt(key string) (token Token) {
	return Token{}
}
