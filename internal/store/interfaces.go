package store

import (
	"github.com/bwmarrin/snowflake"
)

type Model interface {
	// Must be "static."
	IdKey() string // returns something like "id" or "Id"
}

type Repository[MODEL Model] interface {
	Store(data MODEL) error
	FindById(id snowflake.ID) (result MODEL)
	FindByKey(key string, value any) (result MODEL)
}
