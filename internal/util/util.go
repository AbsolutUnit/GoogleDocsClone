package util

import "net/http"

func AddCse356Header(w http.ResponseWriter, id string) {
	w.Header().Set("X-CSE356", id)
}
