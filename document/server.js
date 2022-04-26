require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const MongoDBSession = require('connect-mongodb-session')(session);
const mongoose = require('mongoose');

const docHandlers = require('./docHandlers')
const homeHandlers = require('./homeHandlers')
const mediaHandlers = require('./mediaHandlers')
const indexHandlers = require('./indexHandlers')

// session db setup TODO: THIS WILL NOT WORK WHEN SCALED OUT
const mongoURI = process.env["MONGO_URI"];
mongoose
  .connect(mongoURI, {
    useNewURLParser: true,
    //useCreateIndex: true,
    useUnifiedTopology: true,
  })
  .then((res) => {
    console.log('MongoDB connected');
  });
const store = new MongoDBSession({
  uri: mongoURI,
  collection: 'users', // exact same session store as auth service!
});

// create search index TODO: hope and pray idempotent
indexHandlers.createIndex()

// server setup & middleware
const app = express();
app.use(cors());
app.use((req, res, next) => {
  console.log(req.url);
  console.log(req.body);
  next();
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: 'some key', // TODO: .env this?
    resave: false,
    saveUninitialized: false,
    store: store, 
  })
);
app.use((req, res, next) => {
  res.setHeader('X-CSE356', process.env['CSE_356_ID']);
  next();
});

// endpoints
app.get('/', (req, res) => {
    res.sendFile('/root/finaljs/static/login.html');
  });
app.post('/collection/create', docHandlers.handleCreate);
app.post('/collection/delete', docHandlers.handleDelete);
app.get('/collection/list', docHandlers.handleList);
app.post(
  '/media/upload/',
  mediaHandlers.upload.single('file'),
  mediaHandlers.handleUpload
);
app.get('/media/access/:MEDIAID', mediaHandlers.handleAccess);
app.get('/doc/edit/:DOCID', docHandlers.handleDocEdit);
app.get('/doc/connect/:DOCID/:UID', docHandlers.handleDocConnect);
app.post('/doc/op/:DOCID/:UID', docHandlers.handleDocOp);
app.post('/doc/presence/:DOCID/:UID', docHandlers.handleDocPresence);
app.get('/doc/get/:DOCID/:UID', docHandlers.handleDocGet);
app.get('/home', homeHandlers.handleHome);
app.get('/index/search', indexHandlers.handleSearch)
app.get('/index/suggest', indexHandlers.handleSuggest) 
app.use('/', express.static('/root/finaljs/static'));
// TODO: new endpoints

const port = 8081
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
