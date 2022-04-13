const ot = require('../ot/ot');

const socket = new ReconnectingWebSocket('ws://localhost:8081', [], wsOptions);
const connection = new Connection(socket);

exports.handleCreate = (req, res, next) => {
  const DocID = parseInt(Math.random() * 1000000000).toString();
  let doc = connection.get('docs', docID);
  doc.fetch(function (err) {
    if (err) throw err;
    //if id is already in use...
    while (doc.type !== null) {
      DocID = parseInt(Math.random() * 1000000000).toString();
      doc = connection.get('docs', docID);
    }
    if (doc.type === null) {
      doc.create([{ insert: '\n' }], 'rich-text');
      console.log('doc created!');
    }
  });
  res.write(docID);
};
exports.handleDelete = (req, res, next) => {
  const { docID } = req.body;
  const doc = connection.get('docs', docID);
  doc.fetch(function (err) {
    if (err) throw err;
    //if id is already in use...
    if (doc.type === null) {
      console.log('doc to delete does not exist!');
    } else if (doc.type !== null) {
      doc.destroy(); // this or doc.del()
      console.log(`doc id: ${docID} deleted!`);
    }
  });
};
exports.handleList = (req, res, next) => {
  //https://share.github.io/sharedb/api/connection#createfetchquery
  //https://github.com/share/sharedb-mongo
  //add timestamp as well
};
