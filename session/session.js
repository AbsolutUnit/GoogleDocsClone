// imports
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const WebSocket = require('ws');
const ReconnectingWebSocket = require('reconnecting-websocket');
const wsOptions = { WebSocket: WebSocket };
const Client = require('sharedb/lib/client');
const richText = require('rich-text');
const session = require('express-session');
const MongoDBSession = require('connect-mongodb-session')(session);
const mongoose = require('mongoose'); // export this?

const userController = require('./controllers/userController');
const collectionController = require('./controllers/collectionController');
const mediaController = require('./controllers/mediaController');
const docController = require('./controllers/docController');
const homeController = require('./controllers/homeController');

// db setup
const mongoURI =
  'mongodb+srv://kevinchao:fJkTywtN4BmDnL1x@cluster0.28ur3.mongodb.net/sessions?retryWrites=true&w=majority';
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
  // export this?
  uri: mongoURI,
  collection: 'mySessions',
});
const nameStore = new MongoDBSession({
  // export this?
  uri: mongoURI,
  collection: 'documentnames',
});

// server setup & middleware
const app = express();
app.use(cors());
app.use((req, res, next) => {
  console.log(req.url);
  console.log(req.body);
  next();
});
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: 'some key',
    resave: false,
    saveUninitialized: false,
    store: store,
  })
);
app.use((req, res, next) => {
  res.setHeader('X-CSE356', '61f9d48d3e92a433bf4fc893');
  next();
});
const isAuth = (req, res, next) => {
  //pass this middleware into any endpoint that requires authentication
  if (req.session.isAuth) {
    next();
  } else {
    console.log('not logged in!');
    res.json({ error: true, message: 'not logged in' });
  }
};
app.use('/', express.static('../static'))

// sharedb websocket connection setup
const Connection = Client.Connection; // unused?
Client.types.register(richText.type);
const socket = new ReconnectingWebSocket('ws://localhost:8081', [], wsOptions);
exports.connection = new Connection(socket);

// endpoints
app.get('/', (req, res) => {
  res.sendFile("/root/finaljs/static/login.html");
});
app.post('/users/signup', userController.handleAddUser);
app.post('/users/login', userController.handleLogin);
app.post('/users/logout', userController.handleLogout);
app.get('/users/verify', userController.handleVerify);
app.post('/collection/create', isAuth, collectionController.handleCreate);
app.post('/collection/delete', isAuth, collectionController.handleDelete);
app.get('/collection/list', isAuth, collectionController.handleList);
app.post(
  '/media/upload/',
  isAuth,
  mediaController.upload.single('file'),
  mediaController.handleUpload
);
app.get('/media/access/:MEDIAID', isAuth, mediaController.handleAccess);
app.get('/doc/edit/:DOCID', isAuth, docController.handleDocEdit);
app.get('/doc/connect/:DOCID/:UID', isAuth, docController.handleDocConnect);
app.post('/doc/op/:DOCID/:UID', isAuth, docController.handleDocOp);
app.post('/doc/presence/:DOCID/:UID', isAuth, docController.handleDocPresence);
app.get('/doc/get/:DOCID/:UID', isAuth, docController.handleDocGet);
app.get('/home', isAuth, homeController.handleHome);
app.use('/', express.static("/root/finaljs/static"))

app.listen(8080, () => {
  console.log('Listening on port 8080');
});
