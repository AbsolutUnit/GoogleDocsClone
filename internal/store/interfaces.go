package store

type Model interface {
	Id() string
}

type Repository[MODEL Model] interface {
	Store(data MODEL) error
	FindById(id string) (result MODEL)
	FindByKey(key string, value any) (result MODEL)
}
