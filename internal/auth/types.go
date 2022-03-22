package auth

import (
	"github.com/bwmarrin/snowflake"
)

type Account struct {
	id       snowflake.ID
	Username string
	Password string
	Email    string
	Verified bool
}

func (a Account) IdKey() string {
	return "id"
}

func (a Account) Id() snowflake.ID {
	return a.id
}

type AuthStore interface {
	Store(account Account) error
	FindById(id snowflake.ID) Account
}
