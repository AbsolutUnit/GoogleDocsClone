package store

// MODEL must also have a type that is tagged with `bson:"_id"` if using mongo.
type Model[ID comparable] interface {
	Id() ID
	SetId(ID) error
}

type Repository[MODEL Model[ID], ID comparable] interface {
	Store(data MODEL) error
	DeleteById(id ID) (count int, err error)
	FindById(id ID) (result MODEL, err error)
	FindByKey(key string, value any) (result MODEL, err error)
	FindAll() (all []MODEL)
}
