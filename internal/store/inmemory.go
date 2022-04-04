package store

import "final"

type InMemoryStore[MODEL Model] struct {
	store map[string]Model
}

func NewInMemoryStore[MODEL Model]() *InMemoryStore[MODEL] {
	return &InMemoryStore[MODEL]{
		store: make(map[string]Model),
	}
}

func (ims *InMemoryStore[MODEL]) Store(model MODEL) (err error) {
	ims.store[model.Id()] = model
	return nil
}

func (ims *InMemoryStore[MODEL]) FindById(id string) (result MODEL) {
	return ims.store[id].(MODEL)
}

func (ims *InMemoryStore[MODEL]) FindByKey(key string, value any) (result MODEL) {
	final.LogFatal(nil, "Cannot use FindByKey for inmemory database we should fix this.")
	return
}
