package store

import (
	"errors"
	"final"
)

type InMemoryStore[MODEL Model[ID], ID comparable] struct {
	store map[ID]Model[ID]
}

func NewInMemoryStore[MODEL Model[ID], ID comparable]() *InMemoryStore[MODEL, ID] {
	return &InMemoryStore[MODEL, ID]{
		store: make(map[ID]Model[ID]),
	}
}

func (ims *InMemoryStore[MODEL, ID]) Store(model MODEL) error {
	ims.store[model.Id()] = model
	return nil
}

func (ims *InMemoryStore[MODEL, ID]) FindById(id ID) (result MODEL, err error) {
	res, exists := ims.store[id]
	if exists {
		return res.(MODEL), nil
	} else {
		model := new(MODEL)
		return *model, errors.New("ID not found.")
	}
}

func (ims *InMemoryStore[MODEL, ID]) DeleteById(id ID) (count int, err error) {
	// Delete always deletes even if theres nothing there.
	delete(ims.store, id)
	return 1, nil
}

func (ims *InMemoryStore[MODEL, ID]) FindByKey(key string, value any) (result MODEL, err error) {
	final.LogFatal(nil, "Cannot use FindByKey for inmemory database we should fix this.")
	return *new(MODEL), errors.New("Not implemented. Use mongodb store instead.")
}

func (ims *InMemoryStore[MODEL, ID]) FindAll() (result []MODEL) {
	// Make an empty list, not implemented yet.
	index := 0
	result = make([]MODEL, len(ims.store))
	for k := range ims.store {
		result[index] = ims.store[k].(MODEL)
		index += 1
	}
	return result
}
