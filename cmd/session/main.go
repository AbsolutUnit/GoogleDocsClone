package main

import (
	"net/http"
	"os"

	"final"
	"final/internal/session"
)

func main() {
	cfgFileName := "config.json"
	file, err := os.Open(cfgFileName)
	if err != nil {
		final.LogFatal(err, "could not load configuration from "+cfgFileName)
	}
	config := session.NewSessionConfig(file)

	server := session.NewSessionServer(config)
	// Consume messages from the OT server
	go server.Listen()
	// Start the http server part
	err = http.ListenAndServe(":8080", server)
	if err != nil {
		final.LogFatal(err, "Failed to start session server.")
	}
}
