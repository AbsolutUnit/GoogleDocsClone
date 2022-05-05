const express = require('express');
const cors = require('cors');

const { logger } = require('./logger');
const { authSession, handleAddUser, handleLogin, handleLogout, handleVerify } = require('./authHandlers');
const { handleMediaUpload, handleMediaUploadNext, handleMediaAccess } = require('./mediaHandlers');
const { createIndex, handleDeleteIndex, handleIndexSearch, handleIndexSuggest }
= require('./indexing');

const app = express();
app.use(cors());
app.use((req, _, next) => {
  logger.info(`req.url: ${req.url}`);
  next();
});
// Next, add the CSE 356 header.
app.use((_, res, next) => {
    res.setHeader('X-CSE356', process.env['CSE_356_ID']);
    next();
});
// Add the auth session middleware, since this affects all requests.
app.use(authSession);

app.get('/', (_, res) => {
    res.sendFile('/root/final/static/login.html');
});

app.post(
  '/media/upload/',
  handleMediaUpload.single('file'),
  handleMediaUploadNext
);
app.get('/media/access/:MEDIAID', handleMediaAccess);

// Im putting this back temporarily, since index needs to be authorized.
const isAuth = (req, res, next) => {
  if (req.session.isAuth) {
    next();
  } else {
    logger.warn('not logged in!');
    res.json({ error: true, message: 'not logged in' });
  }
};

createIndex();
app.get('/index/search', isAuth, handleIndexSearch);
app.get('/index/suggest', isAuth, handleIndexSuggest);
app.post('/index/deleteIndex', isAuth, handleDeleteIndex);

// Next, parse the body if we are going to users.
app.use("/users/*", express.json({limit: "25mb" }));
app.use("/users/*", express.urlencoded({ extended: true }));

// Finally, the users routes.
app.post('/users/signup', handleAddUser);
app.post('/users/login', handleLogin);
app.post('/users/logout', handleLogout);
app.get('/users/verify', handleVerify);

const port = process.env["PORT"];
app.listen(port, () => {
  logger.info(`Listening on port ${port}`);
});

// chris: I made docIDs uuids (strings), so if redirecting based on docID, can do smth like this:
// const docID = req.params.docID
// const dest = uuid.parse(docID).reduce((a,b) => a+b, 0) % numShards // which doc service to send to 
// have a map of dest to ips (load ips from .env)

// Kelvin idea better modify the docID to have the port number in there
/*
app.all('/doc/edit/:DOCID/', documentProxy)
app.all('/doc/connect/:DOCID/:UID', documentProxy)
app.all('/doc/op/:DOCID/:UID', documentProxy)
app.all('/doc/edit/:DOCID/:UID', documentProxy)
app.all('/doc/presence/:DOCID/:UID', documentProxy)
app.all('/doc/get/:DOCID/:UID', documentProxy)
*/
