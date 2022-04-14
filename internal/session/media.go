package session

import (
	"encoding/json"
	"final"
	"fmt"
	"net/http"
	"os"
	"strings"
)

// Handle anything under /media
func (ss SessionServer) handleMedia(email string, w http.ResponseWriter, r *http.Request) {
	switch {
	case strings.HasPrefix(r.URL.Path, "/media/upload"):
		// get mime type and check if valid
		mimeType := r.Header.Get("Content-Type")
		if mimeType != "image/jpeg" && mimeType != "image/png" {
			ss.writeError(w, fmt.Sprintf("Invalid MIME type. Received: %s", mimeType))
			return
		}
		ext := strings.TrimPrefix(mimeType, "image/")
		// get file and save to ???
		r.ParseMultipartForm(2 << 23) // 10MB = 10,485,760 bytes. 2 << 23 = 16,777,216 bytes
		file, _, err := r.FormFile("file")
		if err != nil {
			final.LogFatal(err, "failed to read file (media upload) with r.FormFile")
		}
		defer file.Close()
		mediaID := ss.idFactory.Generate().String()
		_, err = os.Create("./media/" + mediaID + "." + ext)
		if err != nil {
			final.LogFatal(err, "failed to create media file")
		}
		json.NewEncoder(w).Encode(struct {
			Mediaid string `json:"mediaid"`
		}{Mediaid: mediaID})
		final.LogDebug(nil, fmt.Sprintf("Created file with ID %s and extension %s", mediaID, ext))
	case strings.HasPrefix(r.URL.Path, "/media/access"):
		// going thru all entries in ./media directory. In future may want map of mediaID to file name (inc ext)? Keep in SessionServer?
		_, _, mediaID, err := parseRequestIDs(r)
		if err != nil {
			final.LogFatal(err, "parseRequestIDs failed")
		}
		entries, err := os.ReadDir("./media")
		if err != nil {
			final.LogFatal(err, "failed to read media directory")
		}
		for _, entry := range entries {
			fn := entry.Name()
			if strings.HasPrefix(fn, mediaID) {
				// get mime type, send back response
				mimeType := strings.Split(fn, ".")[1]
				w.Header().Set("Content-Type", "image/"+mimeType)
				fileBytes, err := os.ReadFile("./media/" + fn)
				if err != nil {
					final.LogFatal(err, "could not read file from ./media")
				}
				w.Write(fileBytes)
				return
			}
		}
	}
}
