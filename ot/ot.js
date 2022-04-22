require('dotenv').config()
var http = require('http');
var express = require('express');
var ShareDB = require('sharedb');
var richText = require('rich-text');
var WebSocket = require('ws');
var WebSocketJSONStream = require('@teamwork/websocket-json-stream');

const mongoURI = process.env["MONGO_URI"];

const db = require('sharedb-mongo')(mongoURI);

ShareDB.types.register(richText.type);
var backend = new ShareDB({
  db: db,
  presence: true,
  doNotForwardSendPresenceErrorsToClient: true,
});
//createDoc(startServer);
startServer();

// Create initial document then fire callback NOT USED
function createDoc(callback) {
  var connection = backend.connect();
  var doc = connection.get('docs', '1');
  doc.fetch(function (err) {
    if (err) throw err;
    if (doc.type === null) {
      doc.create([{ insert: '\n' }], 'rich-text', callback);
      return;
    }
    callback();
  });
}

function startServer() {
  // Create a web server to serve files and listen to WebSocket connections
  var app = express();
  app.use(express.static('static'));
  app.use(express.static('node_modules/quill/dist'));
  var server = http.createServer(app);

  // Connect any incoming WebSocket connection to ShareDB
  var wss = new WebSocket.Server({ server: server });
  wss.on('connection', function (ws) {
    var stream = new WebSocketJSONStream(ws);
    backend.listen(stream);
  });

  server.listen(8081);
  console.log('Listening on http://localhost:8081');
}
