package session

import (
	"testing"
)

func TestTestPassword(t *testing.T) {
	account := Account{
		Name: "test",
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
		{"unhashed", account.Name, account.Password, false},
		{"correct", "test", "$2y$10$8Tt5PeHfjxDHUWgr/E5im.sBIZfwZGtQ7HfZPJfkABNMBm4h3Rw3C", true},
	}

	for _, v := range cases {
		got := account.TestPassword(Account{Name: v.username, Password: v.password})
		if got != v.want {
			t.Fatalf("%s: got %t want %t", v.desc, got, v.want)
		}
	}
}

func TestEmailFrom(t *testing.T) {
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
		desc:  "Wrong signing method",
		token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJFbWFpbCI6InRlc3QyQGV4YW1wbGUuY29tIiwiaXNzIjoiQmFja3lhcmRpZ2FucyIsImV4cCI6MTI1Nzg5NDYwMCwibmJmIjoxMjU3ODkzNDAwfQ.fWjkiRnykvgn8V5Y1FviinUmXak1s1jA4PbOFtWPuYEjxyHWhbzZpg5Wq2yoYpMR7qjl1JXhtHYDjG_IkpWVy4iLSgxVb4lSxEnVG6rJKN99TX6ZF7fagr4gFupvyO4lCtu2egP8VSkYgu9PRiCljfbf54WP8BmMoMciJ-kKoInJMu-z7rVkCCZsemqIc8Nj1A8sVeXFIomahf8A_q-MNBRH0BiqJTqX3_OkXS57zY_Kwl8n8LHe7Qs268-y_1UDxapyi6bt2KqBI9lP3lfzSX4whNir9d9sYb19_nNkg7g28vbyVt8e9U9kHS-DCCaXowf8INGqrrPv3APqVK9I3ewgptnzYAAregRr8cGviHKMY2d8I9DcLR0OZbp-BktCA_cMYvHxI2amvZ2WVgRZZr2cYrs4VCYWXfY6ub22-7z7KFeg0vZ8FdmbbIErT2jx3qNdnudiZdRT1brMD17OrxanFSuIMMbhjakmphfGIQeus3vdAqEAGicxOdHKLl7lXObW_cgGXMJ0M5d7cNBRaEeHrmtgRsBR_dSDxpxzmNOjbZMRHG9o4w4nKp8fSMXbfVDNHKYETt8UyMOtsmXTYFoFlKf4nKVfkv0L_iW4zDKr53AnokLG5SYXOijardrPU71SSfNbccn2grbG_rg66XSUe-EsO7lb_6QW42eL1U8",
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
		if email != v.email && (err != nil) != v.isErr {
			t.Fatalf("%s: expected email: %s error: %t got email: %s error: %s",
				v.desc, v.email, v.isErr, email, err)
		}
	}
}

func TestSendVerificationEmail(t *testing.T) {
	cases := []struct {
		desc  string
		email string
	}{
		{
			desc:  "hope",
			email: "kporter@protonmail.com",
		},
	}
	for _, v := range cases {
		account := Account{Email: v.email, Name: "test"}
		err := account.SendVerificationEmail("testing", "backyardigans", "", "root", "cse356!!!312asdacm", "backyardigans.cse356.compas.cs.stonybrook.edu")
		if err != nil {
			t.Fatalf("%s: could not send to email: %s error: %s", v.desc, v.email, err)
		}
	}
}
