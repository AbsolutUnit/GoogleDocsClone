package store

import (
	"context"
	"time"

	"final"

	"github.com/bwmarrin/snowflake"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MongoDbModel interface {
	// Must be static.
	IdKey() string    // returns something like "id" or "Id"
	Id() snowflake.ID // returns the id
}

type MongoDbStore[model MongoDbModel] struct {
	cli            *mongo.Client
	dbName         string
	collection     string
	timeOutSeconds time.Duration
}

func NewMongoDb[model MongoDbModel](uri, dbName, collection string, timeOutSeconds time.Duration) *MongoDbStore[model] {
	ctx, cancel := context.WithTimeout(context.Background(), timeOutSeconds)
	defer cancel()
	cli, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		final.LogError(err, "could not connect to mongodb instance")
	}
	return &MongoDbStore[model]{
		cli,
		dbName,
		collection,
		timeOutSeconds,
	}
}

func (m *MongoDbStore[Model]) Store(model Model) (err error) {
	col := m.cli.Database(m.dbName).Collection(m.collection)
	ctx, cancel := context.WithTimeout(context.Background(), m.timeOutSeconds)
	defer cancel()
	_, err = col.InsertOne(ctx, model)
	if err != nil {
		final.LogError(err, "could not store database object")
	}
	return
}

func (m *MongoDbStore[Model]) FindById(id snowflake.ID) (result Model) {
	col := m.cli.Database(m.dbName).Collection(m.collection)
	ctx, cancel := context.WithTimeout(context.Background(), m.timeOutSeconds)
	defer cancel()
	filter := bson.D{primitive.E{Key: result.IdKey(), Value: id}}
	err := col.FindOne(ctx, filter).Decode(&result)
	if err != nil && err != mongo.ErrNoDocuments {
		final.LogError(err, "could not look for database object")
	}
	return
}
