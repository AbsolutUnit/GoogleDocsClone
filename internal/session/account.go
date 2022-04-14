package session

import (
	"errors"
	"final"
	"fmt"
	"net/mail"
	"net/smtp"
	"time"

	jwt "github.com/golang-jwt/jwt/v4"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"
)

type Account struct {
	Id_      primitive.ObjectID `json:"id" bson:"_id"`
	Email    string
	Name     string
	Password string
	Verified bool
}

func (a Account) Id() string {
	return a.Id_.Hex()
}

func (a Account) SetId(id string) error {
	id_, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return err

	}
	a.Id_ = id_
	return nil
}

func NewAccount() Account {
	return Account{
		Id_: primitive.NewObjectID(),
	}
}

type AccountClaims struct {
	Id string `json:"id"`
	jwt.RegisteredClaims
}

// Retrieves an account ID from a cookie.
func IdFrom(tokenString string, key string) (string, error) {
	token, err := jwt.ParseWithClaims(tokenString, &AccountClaims{}, func(token *jwt.Token) (any, error) {
		return []byte(key), nil
	})
	if err != nil {
		return "", err
	}
	if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
		return "", errors.New(fmt.Sprintf("Unexpected signing method: %v", token.Header["alg"]))
	}
	if claims, ok := token.Claims.(*AccountClaims); ok && token.Valid {
		return claims.Id, nil
	}
	return "", err
}

func (a *Account) HashPassword() error {
	hashed, err := bcrypt.GenerateFromPassword([]byte(a.Password), 10)
	if err != nil {
		final.LogError(err, "could not hash password")
	}
	a.Password = string(hashed)
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
		Id: a.Id(),
	})
	tokenString, err = token.SignedString([]byte(key))
	return
}

// Send the verification email.
// This is a bit messy, but it'll do for this project.
func (a Account) SendVerificationEmail(key, name, identity, user, pass, host string) error {
	// TODO for milestone 4, refactor this out possibly.
	auth := smtp.PlainAuth(identity, user, pass, host)
	header := make(map[string]string)
	header["To"] = (&mail.Address{Name: a.Name, Address: a.Email}).String()
	header["From"] = (&mail.Address{Name: name, Address: name + "@" + host}).String()
	header["Subject"] = "Account Verification"
	header["Content-Type"] = `text/html; charset="UTF-8"`
	msg := ""

	for k, v := range header {
		msg += fmt.Sprintf("%s: %s\r\n", k, v)
	}

	msg += "\r\n" + fmt.Sprintf("http://%s/users/verify?key=%s", host, key)
	bMsg := []byte(msg)

	if err := smtp.SendMail(host+":587", auth, header["From"], []string{header["To"]}, bMsg); err != nil {
		return err
	}
	return nil
}
