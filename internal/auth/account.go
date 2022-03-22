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
	Id       snowflake.ID
	Username string
	Password string
	Email    string
	Verified bool
}

func (a Account) IdKey() string {
	return "id"
}

// Given a hashed password, hash the account's password and compare the two.
func (a Account) ComparePassword(hashedPassword string) (valid bool) {
	return false
}

// Creates a JWT storing this accounts username given a key to sign it with
func (a Account) CreateJwt(key string) (token Token) {
	return Token{}
}
