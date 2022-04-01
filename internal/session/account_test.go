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

	t.Run("blank password", func(t *testing.T) {
		existingAccount := Account{
			Username: "",
			Password: "",
		}

		got := account.TestPassword(existingAccount)
		want := false

		if got != want {
			t.Errorf("got %t want %t", got, want)
		}
	})

	t.Run("unhashed password", func(t *testing.T) {
		existingAccount := Account{
			Username: "test",
			Password: "password",
		}

		got := account.TestPassword(existingAccount)
		want := false

		if got != want {
			t.Errorf("got %t want %t", got, want)
		}
	})

	t.Run("correct password", func(t *testing.T) {
		existingAccount := Account{
			Username: "test",
			Password: "$2y$10$8Tt5PeHfjxDHUWgr/E5im.sBIZfwZGtQ7HfZPJfkABNMBm4h3Rw3C",
		}

		got := account.TestPassword(existingAccount)
		want := true

		if got != want {
			t.Errorf("got %t want %t", got, want)
		}
	})
}
