package main

import (
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
	server.InitRbmq()
	// Contains starting an HTTP server, should block
	err = server.Start()
	if err != nil {
		final.LogFatal(err, "Failed to start session server.")
	}
}
