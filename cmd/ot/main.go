package main

import (
	"final"
	otPack "final/internal/ot"
	"os"
)

func main() {
	cfgFileName := "config.json"
	file, err := os.Open(cfgFileName)
	if err != nil {
		final.LogFatal(err, "could not load configuration from "+cfgFileName)
	}
	config := otPack.NewOTConfig(file)
	server := otPack.NewOTServer(config)
	server.Start()
	if err != nil {
		final.LogFatal(err, "Failed to start OT server.")
	}
}
