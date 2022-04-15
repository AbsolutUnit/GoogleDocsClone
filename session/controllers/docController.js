//const connection = require('session').connection;
const WebSocket = require('ws');
const ReconnectingWebSocket = require('reconnecting-websocket');
const wsOptions = { WebSocket: WebSocket };
const Client = require('sharedb/lib/client');
const richText = require('rich-text');
const QuillDeltaToHtmlConverter =
  require('quill-delta-to-html').QuillDeltaToHtmlConverter;

const Connection = Client.Connection;
Client.types.register(richText.type);

const DocMapModel = require('../Models/Document');
// const session = require('../session');
// const conn = session.connection;

const socket = new ReconnectingWebSocket('ws://localhost:8081', [], wsOptions);
const connection = new Connection(socket);

const clientMapping = {};
//also do user name mapping to ???, to attach name to cursor SSE response

exports.handleDocEdit = (req, res) => {
  // TODO
};

exports.handleDocConnect = (req, res) => {
  const headers = {
    'X-CSE356': '61f9d48d3e92a433bf4fc893',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
  };
  const docID = req.params.DOCID;
  const clientID = req.params.UID;
  const localPresence = presence.create(
    parseInt(Math.random() * 1000000000).toString()
  );
  const doc = conn.get('docs', docID);
  clientMapping[clientID] = {
    presence: localPresence,
    doc: doc,
  };
  doc.subscribe((err) => {
    if (err) console.log(err);
    const data = `data: ${JSON.stringify({
      content: doc.data.ops,
      version: doc.version,
    })}\n\n`;
    doc.on('op', (op, source) => {
      let data = `data: ${JSON.stringify(op)}\n\n`;
      if (source) {
        // source will be untransformed op
        data = `data: ${JSON.stringify({ ack: source })}\n\n`;
      }
      res.write(data);
    });
  });
  localPresence.subscribe(() => {
    presence.on('receive', (id, val) => {
      const {index, length} = val // no idea what val's shape is
      let data = `data: ${JSON.stringify({id: clientID, cursor: {index: index, length: length, name: }})}` // how to get name of user?
    })
  })
};

exports.handleDocOp = (req, res) => {
  const docID = req.params.DOCID;
  const clientID = req.params.UID;
  const doc = clientMapping[clientID].doc;
  if (req.body.version < doc.version) {
    res.send(`${JSON.stringify({ status: 'retry' })}`);
    return;
  }
  doc.submitOp(req.body.op, { source: req.body.op });
  res.send(`${JSON.stringify({ status: 'ok' })}`);
};

exports.handleDocPresence = (req, res) => {
  const { index, length } = req.body();
  const docID = req.params.DOCID;
  const clientID = req.params.UID;
  const doc = conn.get('docs', docID);

  const range = {
    index,
    length,
  };

  let localPresence = clientMapping[docID];
  localPresence.submit(range, function (err) {
    if (err) throw err;
  });
};

exports.handleDocGet = (req, res) => {
  const docID = req.params.DOCID;
  const clientID = req.params.UID;
  const doc = conn.get('docs', docID);
  const deltaOps = doc.data.ops;
  const converter = new QuillDeltaToHtmlConverter(deltaOps, {});
  const html = converter.convert();
  res.send(html);
  res.end();
};
