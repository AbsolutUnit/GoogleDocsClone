import express from "express";
import ShareDB from "sharedb";
import ws from "ws";
const richText = require('rich-text');

const app = express()
const server = http.createServer(app)
const webSocketServer = WebSocket.Server({server: server})

const backend = new ShareDB()
backend.types.register(richText.type)
webSocketServer.on('connection', (webSocket) => {
  let stream = new WebSocketJSONStream(webSocket)
  backend.listen(stream)
})

server.listen(8081)