const express = require('express');
const cors = require('cors');
const httpProxy = require('http-proxy');

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


// Now, if it needs to be proxied, proxy it.

const proxy = httpProxy.createProxyServer();

let docServers = process.env["DOCUMENT_SHARDS"]
if (typeof(docServers == "string")) {
  docServers = docServers.substr(1, docServers.length - 2).replace(/"/g,'').split(",");
}

// const docServers = process.env["DOCUMENT_SHARDS"];
const docServerCount = docServers.length;
const docServerChoice = (docID) => docID.substring(0, docID.indexOf("-")); // gets shardID from start of docID

// Proxy rules: proxy to the shard id, then proxy after with nginx on a smaller section of the shard id.
function documentProxy(req, res) {
  if (req.session.isAuth) {
    logger.info(`req.params.docID: ${req.params.docID}`)
    const target = docServers[parseInt(docServerChoice(req.params.docID))];
    proxy.web(req, res, {target: target});
  } else {
    logger.warn("Unauthenticated.");
  }
}
app.all('/doc/*/:docID/:UID', documentProxy);

// Round robin the collection requests between the document servers.
let collectionsMade = 0;
function collectionCreateProxy(req, res) {
  if (req.session.isAuth) {
    const target = docServers[collectionsMade % docServerCount];
    logger.debug(`target: ${target}, typeof: ${typeof(target)}`);
    logger.info(`Collection request: redirecting to ${target}`);
    collectionsMade++;
    proxy.web(req, res, {target: target});
  }
}
app.all('/collection/create', collectionCreateProxy);

// Like document proxy, but we need to get the document ID from the body.
function collectionDeleteProxy(req, res) {
  if (req.session.isAuth) {
    const target = docServers[parseInt(docServerChoice(req.body.docId))];
    proxy.web(req, res, {target: target});
  }
}
app.all('/collection/delete', express.json(), collectionDeleteProxy);

// We send collection list to the server that has created a document least recently.
// We guess this server has the least load, and that server checks the database for the top 10.
function collectionListProxy(req, res) {
  if (req.session.isAuth) {
    const target = docServers[(collectionsMade + 1) % docServerCount];
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
    logger.warn('not logged in!');
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
