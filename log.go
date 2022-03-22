package final

import (
	"log"
	"os"
	"runtime"
)

func LogDebug(err error, reason string) {
	log.Printf("D: " + reason + "\n")
	if err != nil {
		log.Println("  cause:", err)
	}
	_, file, line, ok := runtime.Caller(1)
	if ok {
		log.Printf("  at: %s:%d", file, line)
	}
}

func LogError(err error, reason string) {
	log.Printf("E: " + reason + "\n")
	if err != nil {
		log.Println("  cause:", err)
	}
	_, file, line, ok := runtime.Caller(1)
	if ok {
		log.Printf("  at: %s:%d", file, line)
	}
}

func LogFatal(err error, reason string) {
	log.Printf("F: " + reason + "\n")
	if err != nil {
		log.Println("  cause:", err)
	}
	_, file, line, ok := runtime.Caller(1)
	if ok {
		log.Printf("  at: %s:%d", file, line)
	}
	os.Exit(1)
}
