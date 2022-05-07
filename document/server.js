// require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MongoDBSession = require('connect-mongodb-session')(session);
const mongoose = require('mongoose');
const { logger } = require('./logger')

const docHandlers = require('./docHandlers')
const homeHandlers = require('./homeHandlers')


// session storage
const sessionStoreURI = process.env["SESSION_STORE_URI"];
logger.info(`sessionStoreURI: ${sessionStoreURI}`)
mongoose
  .connect(sessionStoreURI, {
    useNewURLParser: true,
    //useCreateIndex: true,
    useUnifiedTopology: true,
  })
  .then((res) => {
    logger.info('MongoDB connected');
  });
const store = new MongoDBSession({
  uri: sessionStoreURI,
  collection: 'users', 
});

// server setup & middleware
const app = express();
app.use(cors());
app.use((req, res, next) => {
  logger.info(`Server Request URL: ${req.url}`);
  next();
});
app.use(express.json({limit: "25mb" }));
app.use((req, res, next) => {
  logger.debug(`Server Request Body: ${JSON.stringify(req.body)}`);
  next();
});
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
const isAuth = (req, res, next) => {
  if (req.session.isAuth) {
    next();
  } else {
    logger.warn('not logged in!');
    res.json({error: true, message: 'not logged in' });
  }
};
app.use(isAuth);

// endpoints
app.get('/', (req, res) => {
    res.sendFile('/root/final/static/login.html');
  });
app.post('/collection/create', docHandlers.handleCreate);
app.post('/collection/delete', docHandlers.handleDelete);
app.get('/collection/list', docHandlers.handleList);
app.get('/doc/edit/:DOCID', docHandlers.handleDocEdit);
app.get('/doc/connect/:DOCID/:UID', docHandlers.handleDocConnect);
app.post('/doc/op/:DOCID/:UID', docHandlers.handleDocOp);
app.post('/doc/presence/:DOCID/:UID', docHandlers.handleDocPresence);
app.get('/doc/get/:DOCID/:UID', docHandlers.handleDocGet);
app.get('/home', homeHandlers.handleHome);
// TODO: new endpoints

const port = process.env["PORT"];
app.listen(port, () => {
  logger.info(`Listening on port ${port}`);
});
