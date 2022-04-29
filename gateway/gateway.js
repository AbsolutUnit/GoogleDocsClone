const express = require('express');
const cors = require('cors');
const process = require('process');
const httpProxy = require('http-proxy');

const { logger } = require('./logger');
const { authSession, handleAddUser, handleLogin, handleLogout, handleVerify } = require('./authHandlers');
const { handleMediaUpload, handleMediaUploadNext, handleMediaAccess } = require('./mediaHandlers');
const { createIndex, handleDeleteIndex, handleIndexSearch, handleIndexSuggest } = require('./indexHandlers');

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
// Add the auth session middleware, since this effects all requests.
app.use(authSession);

// function logResponseBody(req, res, next) {
//   var oldWrite = res.write,
//       oldEnd = res.end;

//   var chunks = [];

//   res.write = function (chunk) {
//     chunks.push(chunk);

//     return oldWrite.apply(res, arguments);
//   };

//   res.end = function (chunk) {
//     if (chunk)
//       chunks.push(chunk);

//     var body = Buffer.concat(chunks).toString('utf8');
//     logger.info(`response: ${req.path} ${JSON.stringify(body)}`);

//     oldEnd.apply(res, arguments);
//   };

//   next();
// }
// app.use(logResponseBody);

app.get('/', (_, res) => {
    res.sendFile('/root/final/static/login.html');
  });


// Now, if it needs to be proxied, proxy it.

const proxy = httpProxy.createProxyServer();
const docServerCount = process.env["DOCUMENT_SHARDS"].length;
const docServerChoice = (docID) => docID.substring(0, docID.indexOf("-"));

// Proxy rules: proxy to the shard id, then proxy after with nginx on a smaller section of the shard id.
function documentProxy(req, res) {
  if (req.session.isAuth) {
    target = process.env["DOCUMENT_SHARDS"][parseInt(docServerChoice(req.params.docID))];
    proxy.web(req, res, {target: target});
  } else {
    logger.info("Unauthenticated.");
  }
}
app.all('/doc/*/:docID/*', documentProxy);

// Round robin the collection requests between the document servers.
const collectionsMade = 0;
function collectionCreateProxy(req, res) {
  if (req.session.isAuth) {
    target = process.env["DOCUMENT_SHARDS"][collectionsMade % docServerCount];
    logger.info(`Collection request: redirecting to ${target}`)
    collectionsMade++;
    proxy.web(req, res, {target: target});
  }
}
app.all('/collection/create', collectionCreateProxy);

// Like document proxy, but we need to get the document ID from the body.
function collectionDeleteProxy(req, res) {
  if (req.session.isAuth) {
    target = process.env["DOCUMENT_SHARDS"][parseInt(docServerChoice(req.body.docId))];
    proxy.web(req, res, {target: target});
  }
}
app.all('/collection/delete', express.json(), collectionDeleteProxy);

// We send collection list to the server that has created a document least recently.
// We guess this server has the least load, and that server checks the database for the top 10.
function collectionListProxy(req, res) {
  if (req.session.isAuth) {
    target = process.env["DOCUMENT_SHARDS"][(collectionsMade + 1) % docServerCount];
    proxy.web(req, res, {target: target});
  }
}
app.all('/collection/list', collectionListProxy);

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
    console.log('not logged in!');
    res.redirect('/');
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
