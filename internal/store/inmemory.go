package store

import "final"

type InMemoryStore[MODEL Model[ID], ID comparable] struct {
	store map[ID]Model[ID]
}

func NewInMemoryStore[MODEL Model[ID], ID comparable]() *InMemoryStore[MODEL, ID] {
	return &InMemoryStore[MODEL, ID]{
		store: make(map[ID]Model[ID]),
	}
}

func (ims *InMemoryStore[MODEL, ID]) Store(model MODEL) (err error) {
	ims.store[model.Id()] = model
	return nil
}

func (ims *InMemoryStore[MODEL, ID]) FindById(id ID) (result MODEL) {
	return ims.store[id].(MODEL)
}

func (ims *InMemoryStore[MODEL, ID]) FindByKey(key string, value any) (result MODEL) {
	final.LogFatal(nil, "Cannot use FindByKey for inmemory database we should fix this.")
	return
}
