package session

import (
	"net/http"
	"strings"
)

// Handle anything under /media
func (ss SessionServer) handleMedia(email string, w http.ResponseWriter, r *http.Request) {
	switch {
	case strings.HasPrefix(r.URL.Path, "/media/upload"):
		// TODO
	case strings.HasPrefix(r.URL.Path, "/media/access"):
		// TODO
	}
}
