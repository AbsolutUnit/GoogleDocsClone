package session

import (
	"errors"
	"fmt"
	"net/mail"
	"net/smtp"
	"time"

	jwt "github.com/golang-jwt/jwt/v4"
	"golang.org/x/crypto/bcrypt"
)

type Account struct {
	Email    string
	Username string
	Password string
	Verified bool
}

type AccountClaims struct {
	Email string `json:"email"`
	jwt.RegisteredClaims
}

// Retrieves an account ID from a cookie.
func IdFrom(tokenString string, key string) (Account, error) {
	token, err := jwt.ParseWithClaims(tokenString, &AccountClaims{}, func(token *jwt.Token) (any, error) {
		return []byte(key), nil
	})
	if err != nil {
		return Account{}, err
	}
	if claims, ok := token.Claims.(*AccountClaims); ok && token.Valid {
		return Account{Email: claims.Email}, nil
	}
	return Account{}, err
}

func (a Account) Id() string {
	// Email as Id for now.
	return a.Email
}

func (a Account) HashPassword() error {
	hashed, err := bcrypt.GenerateFromPassword([]byte(a.Password), 10)
	if err != nil {
		a.Password = string(hashed)
	}
	return err
}

// Given an account with a hashed password, hash this account's password and compare the two.
func (a Account) TestPassword(account Account) (valid bool) {
	// bcrypt with cost factor 10 (default)
	return bcrypt.CompareHashAndPassword([]byte(account.Password), []byte(a.Password)) == nil
}

// Creates a JWT storing this accounts username given a key to sign it with.
func (a Account) CreateJwt(key string) (tokenString string, err error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, AccountClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "Backyardigans",
			NotBefore: jwt.NewNumericDate(time.Now().Add(-time.Minute * 10)),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute * 30)),
		},
		Email: a.Email,
	})
	tokenString, err = token.SignedString(key)
	// Remove header
	// if err != nil {
	// 	tokenString = tokenString[strings.Index(tokenString, ".")+1:]
	// }
	return
}

func (a Account) SendVerificationEmail(key string, host string) error {
	verifyString, err := a.CreateJwt(key)
	if err != nil {
		return errors.New("Internal error: could not generate session token: " + err.Error())
	}
	// TODO for milestone 4, refactor this out possibly.
	auth := smtp.PlainAuth("", "", "", host)
	from := mail.Address{Name: "Backyardigans", Address: "backyardigans" + host}
	msg := fmt.Sprintf("https://%s/users/verify?key=%s\r\n", host, verifyString)
	return smtp.SendMail(host+":25", auth, from.String(), []string{a.Email}, []byte(msg))
}
