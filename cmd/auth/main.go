package main

import (
	"net/http"
	"os"

	"final"
	"final/internal/auth"
)

func main() {
	cfgFileName := "config.json"
	file, err := os.Open(cfgFileName)
	if err != nil {
		final.LogFatal(err, "could not load configuration from "+cfgFileName)
	}
	config := auth.NewAuthConfig(file)

	server := auth.NewAuthServer(config)
	err = http.ListenAndServe(":8080", server)
	if err != nil {
		final.LogFatal(err, "could not start http server")
	}
}
