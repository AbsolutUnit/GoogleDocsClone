const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('@elastic/elasticsearch');
const app = express();

const indexHandler = require('./indexHandler');

app.use(bodyParser.json());

const client = new Client({
    node: 'http://localhost:9200',
});

app.post('/deleteIndex', (req,res) => {
    indexHandler.deleteIndex();
    res.write('index deleted');
    res.end();
});

app.post('/createIndex', (req, res) => {
    indexHandler.createIndex();
    res.write('index created');
    res.end();
});

app.post('/addDocument', (req,res) => {
    const {id, name, text} = req.body;

    indexHandler.addDocument(id, name, text);
});

app.post('/updateDocument', (req, res) => { 
    const {text, id} = req.body;

    indexHandler.updateDocument(text, id);
});

app.get('/index/search/', indexHandler.handleSearch);

app.get('/index/suggest/', indexHandler.handleSuggest);

app.listen(3000, () => {
    console.log('connected');
});

