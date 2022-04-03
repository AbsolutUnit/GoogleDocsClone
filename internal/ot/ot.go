package ot

import (
	"final"
	"fmt"
	"net/http"
	"github.com/xxuejie/go-delta-ot/ot"
	"github.com/fmpwizard/go-quilljs-delta/delta"
)

type Document struct {
	contents delta.Delta
	ID string
	clientIds []string
} 

func (d Document) Get (html string){

}
