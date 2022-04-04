package store

type Model[ID comparable] interface {
	Id() ID
}

type Repository[MODEL Model[ID], ID comparable] interface {
	Store(data MODEL) error
	FindById(id ID) (result MODEL)
	FindByKey(key string, value any) (result MODEL)
}
