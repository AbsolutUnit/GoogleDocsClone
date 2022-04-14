package store

import (
	"context"
	"errors"
	"time"

	"final"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MongoDbStore[MODEL Model[ID], ID ~string] struct {
	cli            *mongo.Client
	dbName         string
	collection     string
	timeOutSeconds time.Duration
}

func NewMongoDbStore[MODEL Model[ID], ID ~string](uri, dbName, collection string, timeOutSeconds time.Duration) *MongoDbStore[MODEL, ID] {
	ctx, cancel := context.WithTimeout(context.Background(), timeOutSeconds)
	defer cancel()
	cli, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		final.LogError(err, "could not connect to mongodb instance")
	}
	return &MongoDbStore[MODEL, ID]{
		cli,
		dbName,
		collection,
		timeOutSeconds,
	}
}

func (m *MongoDbStore[MODEL, ID]) Store(model MODEL) (err error) {
	col := m.cli.Database(m.dbName).Collection(m.collection)
	ctx, cancel := context.WithTimeout(context.Background(), m.timeOutSeconds)
	defer cancel()

	// HACK this is terrible and a race condition if something stores at the same time as anything else
	// but hey thats like also a race condition of them storing at the same time.
	_, err = m.DeleteById(model.Id())
	if err != nil {
		final.LogError(err, "could not store database object")
	}

	_, err = col.InsertOne(ctx, model)
	if err != nil {
		final.LogError(err, "could not store database object")
	}
	return
}

func (m *MongoDbStore[MODEL, ID]) FindById(id ID) (MODEL, error) {
	col := m.cli.Database(m.dbName).Collection(m.collection)
	ctx, cancel := context.WithTimeout(context.Background(), m.timeOutSeconds)
	defer cancel()

	objId, err := primitive.ObjectIDFromHex(string(id))
	if err != nil {
		return *new(MODEL), errors.New("Invalid ID.")
	}

	final.LogDebug(nil, objId.String())
	filter := bson.D{bson.E{Key: "_id", Value: objId}}

	result := new(MODEL)
	err = col.FindOne(ctx, filter).Decode(result)
	return *result, err
}

func (m *MongoDbStore[MODEL, ID]) DeleteById(id ID) (count int, err error) {
	col := m.cli.Database(m.dbName).Collection(m.collection)
	ctx, cancel := context.WithTimeout(context.Background(), m.timeOutSeconds)
	defer cancel()

	objId, err := primitive.ObjectIDFromHex(string(id))
	if err != nil {
		return 0, errors.New("Invalid ID.")
	}

	filter := bson.M{"_id": bson.M{"$eq": objId}}
	res, err := col.DeleteOne(ctx, filter)
	return int(res.DeletedCount), err
}

func (m *MongoDbStore[MODEL, ID]) FindByKey(key string, value any) (result MODEL, err error) {
	col := m.cli.Database(m.dbName).Collection(m.collection)
	ctx, cancel := context.WithTimeout(context.Background(), m.timeOutSeconds)
	defer cancel()

	filter := bson.M{key: bson.M{"$eq": value}}
	err = col.FindOne(ctx, filter).Decode(&result)
	return result, err
}

func (m *MongoDbStore[MODEL, ID]) FindAll() (result []MODEL) {
	// Make an empty list, not implemented yet.
	return make([]MODEL, 0)
}
