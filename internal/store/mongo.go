package store

import (
	"context"
	"time"

	"final"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MongoDbStore[MODEL Model] struct {
	cli            *mongo.Client
	dbName         string
	collection     string
	timeOutSeconds time.Duration
}

func NewMongoDb[MODEL Model](uri, dbName, collection string, timeOutSeconds time.Duration) *MongoDbStore[MODEL] {
	ctx, cancel := context.WithTimeout(context.Background(), timeOutSeconds)
	defer cancel()
	cli, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		final.LogError(err, "could not connect to mongodb instance")
	}
	return &MongoDbStore[MODEL]{
		cli,
		dbName,
		collection,
		timeOutSeconds,
	}
}

func (m *MongoDbStore[MODEL]) Store(model MODEL) (err error) {
	col := m.cli.Database(m.dbName).Collection(m.collection)
	ctx, cancel := context.WithTimeout(context.Background(), m.timeOutSeconds)
	defer cancel()
	_, err = col.InsertOne(ctx, model)
	if err != nil {
		final.LogError(err, "could not store database object")
	}
	return
}

func (m *MongoDbStore[MODEL]) FindById(id string) (result MODEL) {
	col := m.cli.Database(m.dbName).Collection(m.collection)
	ctx, cancel := context.WithTimeout(context.Background(), m.timeOutSeconds)
	defer cancel()
	// TODO: is this a bug because id isn't capitalized?
	filter := bson.D{primitive.E{Key: "Id", Value: id}}
	err := col.FindOne(ctx, filter).Decode(&result)
	if err != nil && err != mongo.ErrNoDocuments {
		final.LogError(err, "could not look for database object")
	}
	return
}

func (m *MongoDbStore[MODEL]) FindByKey(key string, value any) (result MODEL) {
	col := m.cli.Database(m.dbName).Collection(m.collection)
	ctx, cancel := context.WithTimeout(context.Background(), m.timeOutSeconds)
	defer cancel()
	filter := bson.D{primitive.E{Key: key, Value: value}}
	err := col.FindOne(ctx, filter).Decode(&result)
	if err != nil && err != mongo.ErrNoDocuments {
		final.LogError(err, "could not look for database objects")
	}
	return
}
