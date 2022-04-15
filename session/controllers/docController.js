const WebSocket = require('ws');
const ReconnectingWebSocket = require('reconnecting-websocket');
const wsOptions = { WebSocket: WebSocket };
const Client = require('sharedb/lib/client');
const richText = require('rich-text');

const Connection = Client.Connection;
Client.types.register(richText.type);

const DocMapModel = require('../Models/Document');

const connection = require('./../session').connection;

let doc = class {
  id;
  semaphore;
  constructor(id) {
    this.id = id
    this.semaphore = 1;
  }
  lock() {
    this.semaphore--;
  }
  unlock() {
    this.semaphore++;
  }
}

let docs = {}

exports.handleDocEdit = (req, res) => {
    // TODO
}

exports.handleDocConnect = (req, res) => {
    // TODO
}

exports.handleDocOp = async (req, res) => {
    // TODO
  const { docId, clientId } = req.params;
  const { version, op } = req.body;

  doc = docs[docId]
  if (doc == null) {
    return;
  }

  doc.unlock();
}

exports.handleDocPresence = (req, res) => {
    // TODO
}

exports.handleDocGet = (req, res) => {
    // TODO
}
