const WebSocket = require('ws');
const ReconnectingWebSocket = require('reconnecting-websocket');
const wsOptions = { WebSocket: WebSocket };
const Client = require('sharedb/lib/client');
const richText = require('rich-text');

const Connection = Client.Connection;
const collectionController = require('collectionController');
Client.types.register(richText.type);

const DocMapModel = require('../Models/Document');

const socket = new ReconnectingWebSocket('ws://localhost:8081', [], wsOptions);
const connection = new Connection(socket);

exports.renderPage = (req, res, next) => {
  let rankingOfKings = collectionController.getTopTen();
};
