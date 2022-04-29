const express = require('express');
const cors = require('cors');
const session = require('express-session');
const process = require('process');
const httpProxy = require('http-proxy');
const { Snowflake } = require('nodejs-snowflake');

const { logger } = require('./logger');
const { authStore, handleAddUser, handleLogin, handleLogout, handleVerify } = require('./auth');

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
// Add the session middleware, since this effects all requests.
app.use(
    session({ // TODO: not sure if auth session middleware dif from document session middleware
      secret: 'some key', // TODO: .env this?
      resave: false,
      saveUninitialized: false,
      store: authStore,
    })
);

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

// Now, if it needs to be proxied, proxy it.

const proxy = httpProxy.createProxyServer();
const docServerCount = process.env["DOCUMENT_SHARDS"].length;
const docServerChoice = (docID) => Snowflake.instanceIDFromID(docID);

// Proxy rules: proxy to the shard id, then proxy after with nginx on the random part of the snowflake.
function documentProxy(req, res) {
  if (req.session.isAuth) {
    target = process.env["DOCUMENT_SHARDS"][docServerChoice(parseInt(req.params.docID))];
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
    target = process.env["DOCUMENT_SHARDS"][docServerChoice(parseInt(req.body.docId))];
    proxy.web(req, res, {target: target});
  }
}
app.all('/collection/delete', express.json(), collectionDeleteProxy);

app.all('/media/*', documentProxy);
app.all('/index/*', documentProxy);
app.get('/', (_, res) => {
    res.sendFile('/root/final/static/login.html');
  });

// Next, parse the body if we are going to users.
app.use("/users/*", express.json({limit: "25mb" }));
app.use("/users/*", express.urlencoded({ extended: true }));

// Finally, the users routes.
app.post('/users/signup', handleAddUser);
app.post('/users/login', handleLogin);
app.post('/users/logout', handleLogout);
app.get('/users/verify', handleVerify);

const port = 8080
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
