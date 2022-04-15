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

exports.handleCreate = (req, res, next) => {
  const { name } = req.body;
  const docID = parseInt(Math.random() * 1000000000).toString();
  let doc = connection.get('docs', docID);
  doc.fetch(async function (err) {
    if (err) throw err;
    // if id is already taken...
    while (doc.type !== null) {
      docID = parseInt(Math.random() * 1000000000).toString();
      doc = connection.get('docs', docID);
    }
    if (doc.type === null) {
      doc.create([{ insert: '\n' }], 'rich-text');
      doc.submitSource = true;
      console.log('doc created!');
      let documentMap = new DocMapModel({
        docName: name,
        docID,
      });
      await documentMap.save(function (err) {
        if (err) console.log("couldn't save the document map");
      });
      console.log('document mapping saved!');
    }
  });

  res.json({ docid: docID });
  res.end();
};

exports.handleDelete = async (req, res, next) => {
  const { docid: docID } = req.body;
  const doc = connection.get('docs', docID);
  doc.fetch(async function (err) {
    if (err) throw err;
    //console.log(doc);
    if (doc.type === null) {
      console.log('doc to delete does not exist!');
    } else if (doc.type !== null) {
      doc.del(); // this or doc.del()
      console.log(`doc id: ${docID} deleted!`);
      DocMapModel.deleteOne({ docID }, function (err) {
        if (err) {
          return console.log(err);
        } else {
          console.log('document mapping deleted!');
        }
      });
    }
  });
  res.end();
};

exports.handleList = (req, res, next) => {
  res.json(getTopTen());
  res.end();
};

exports.getTopTen = () => {
  const query = connection.createFetchQuery('docs', {
    $sort: { '_m.mtime': -1 },
    $limit: 10,
  });
  let resList = [];
  query.on('ready', async function () {
    docList = query.results;
    for (const doc of docList) {
      let name = await DocMapModel.findOne({ docID: doc.id });
      resList.push({ id: doc.id, name: name.docName });
    }
  });
  return resList;
}
