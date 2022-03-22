package store

import (
	"github.com/bwmarrin/snowflake"
)

type Repository interface {
	Store(data interface{}) error
	FindById(id snowflake.ID) (data interface{}, err error)
}
