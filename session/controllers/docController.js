const WebSocket = require('ws');
const ReconnectingWebSocket = require('reconnecting-websocket');
const wsOptions = { WebSocket: WebSocket };
const Client = require('sharedb/lib/client');
const richText = require('rich-text');

const Connection = Client.Connection;
Client.types.register(richText.type);

const DocMapModel = require('../Models/Document');

const socket = new ReconnectingWebSocket('ws://localhost:8081', [], wsOptions);
const connection = new Connection(socket);


exports.handleDocEdit = (req, res) => {
    // TODO
}

exports.handleDocConnect = (req, res) => {
    // TODO
}

exports.handleDocOp = (req, res) => {
    // TODO
}

exports.handleDocPresence = (req, res) => {
    // TODO
}

exports.handleDocGet = (req, res) => {
    // TODO
}