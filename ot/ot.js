var express = require("express")
var ShareDB = require("sharedb")
var WebSocket = require("ws")
var richText = require('rich-text');
var http = require('http');
var WebSocketJSONStream = require('@teamwork/websocket-json-stream');

const app = express()
const server = http.createServer(app)
const webSocketServer = new WebSocket.Server({server: server})

const backend = new ShareDB()
ShareDB.types.register(richText.type)
webSocketServer.on('connection', (webSocket) => {
  let stream = new WebSocketJSONStream(webSocket)
  backend.listen(stream)
})

server.listen(8081)