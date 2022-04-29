const express = require('express');
const cors = require('cors');
const session = require('express-session');
const process = require('process');
const httpProxy = require('http-proxy');

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
function documentProxy(req, res) {
  const urlArray = req.url.split('/')
  logger.info(`urlArray ${urlArray}`)
  if (req.session.isAuth) {
    let base = process.env['DOC_BASE_URL']
    let target = Math.random() < 0.5 ? `${base}${process.env['DOC0_PORT']}` :
    `${base}${process.env['DOC1_PORT']}`
    if (urlArray[1] === 'doc') {
      const docID = urlArray[3]
      logger.info(`docID: ${JSON.stringify(docID)}`)  
      target = `${base}${docID.substr(-4,4)}` 
    }
    logger.info("Redirecting to document server");
    proxy.web(req, res, {target: target});
  } else {
    logger.info("Unauthenticated.");
  }
}
app.all('/doc/*/:docID/*', documentProxy);
app.all('/media/*', documentProxy);
app.all('/collection/*', documentProxy);
app.all('/index/*', documentProxy);
app.all('/', documentProxy);

// Next, parse the body - we don't parse if we are proxying, so this goes here.
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
