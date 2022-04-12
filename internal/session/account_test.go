package session

import (
	"testing"
)

func TestTestPassword(t *testing.T) {
	account := Account{
		Username: "test",
		Password: "password",
		Email:    "test@example.com",
		Verified: false,
	}

	cases := []struct {
		desc     string
		username string
		password string
		want     bool
	}{
		{"blank", "", "", false},
		{"unhashed", account.Username, account.Password, false},
		{"correct", "test", "$2y$10$8Tt5PeHfjxDHUWgr/E5im.sBIZfwZGtQ7HfZPJfkABNMBm4h3Rw3C", true},
	}

	for _, v := range cases {
		got := account.TestPassword(Account{Username: v.username, Password: v.password})
		if got != v.want {
			t.Fatalf("%s: got %t want %t", v.desc, got, v.want)
		}
	}
}

func TestIdFrom(t *testing.T) {
	cases := []struct {
		desc  string
		token string
		key   string
		email string
		isErr bool
	}{{
		desc:  "Unexpired JWT",
		token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJFbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJpc3MiOiJCYWNreWFyZGlnYW5zIiwiZXhwIjoyMDgyNzYyMDAwLCJuYmYiOjk0NjY4ODQwMH0.YrArib7NoSPDBuINE9vqjxJbBJRN_bUXFUdWJGjlMmk",
		key:   "test",
		email: "test@example.com",
		isErr: false,
	}, {
		desc:  "Expired JWT",
		token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJFbWFpbCI6InRlc3QyQGV4YW1wbGUuY29tIiwiaXNzIjoiQmFja3lhcmRpZ2FucyIsImV4cCI6MTI1Nzg5NDYwMCwibmJmIjoxMjU3ODkzNDAwfQ.10Y7kToBmfsXRu8ix8T1QoYuTWURk2ZBp57M_Dp3VC0",
		key:   "test",
		email: "",
		isErr: true,
	}, {
		desc:  "Fully empty test",
		token: "",
		key:   "",
		email: "",
		isErr: true,
	}}

	for _, v := range cases {
		email, err := IdFrom(v.token, v.key)
		if email.Email != v.email && (err != nil) != v.isErr {
			t.Fatalf("%s: expected email: %s error: %t got email: %s error: %s",
				v.desc, v.email, v.isErr, email.Email, err)
		}
	}
}
