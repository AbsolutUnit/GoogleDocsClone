require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');

const docHandlers = require('./docHandlers')
const homeHandlers = require('./homeHandlers')
const mediaHandlers = require('./mediaHandlers')

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
    // store: store, // don't think we need a session store for document side?
  })
);
app.use((req, res, next) => {
  res.setHeader('X-CSE356', process.env['CSE_356_ID']);
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

// endpoints
app.get('/', (req, res) => {
    res.sendFile('/root/finaljs/static/login.html');
  });
app.post('/collection/create', isAuth, docHandlers.handleCreate);
app.post('/collection/delete', isAuth, docHandlers.handleDelete);
app.get('/collection/list', isAuth, docHandlers.handleList);
app.post(
  '/media/upload/',
  isAuth,
  mediaHandlers.upload.single('file'),
  mediaHandlers.handleUpload
);
app.get('/media/access/:MEDIAID', isAuth, mediaHandlers.handleAccess);
app.get('/doc/edit/:DOCID', isAuth, docHandlers.handleDocEdit);
app.get('/doc/connect/:DOCID/:UID', isAuth, docHandlers.handleDocConnect);
app.post('/doc/op/:DOCID/:UID', isAuth, docHandlers.handleDocOp);
app.post('/doc/presence/:DOCID/:UID', isAuth, docHandlers.handleDocPresence);
app.get('/doc/get/:DOCID/:UID', isAuth, docHandlers.handleDocGet);
app.get('/home', isAuth, homeHandlers.handleHome);
app.use('/', express.static('/root/finaljs/static'));
// TODO: new endpoints

const port = 8080
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
