const DocModel = require('../Models/Document');

const socket = new ReconnectingWebSocket('ws://localhost:8081', [], wsOptions);
const connection = new Connection(socket);

exports.handleCreate = async (req, res, next) => {
  const { name } = req.body;
  const DocID = parseInt(Math.random() * 1000000000).toString();
  let doc = connection.get('docs', docID);
  doc.fetch(function (err) {
    if (err) throw err;
  });
  // if id is already taken...
  while (doc.type !== null) {
    DocID = parseInt(Math.random() * 1000000000).toString();
    doc = connection.get('docs', docID);
  }
  if (doc.type === null) {
    doc.create([{ insert: '\n' }], 'rich-text');
    console.log('doc created!');
    let documentMap = new DocModel({
      name,
      docID,
    });
    await documentMap.save();
    console.log('doc name mapping saved!');
  }
  res.write(docID); //TEST IF WORKS???
};
exports.handleDelete = async (req, res, next) => {
  const { docID } = req.body;
  const doc = connection.get('docs', docID);
  doc.fetch(function (err) {
    if (err) throw err;
  });
  if (doc.type === null) {
    console.log('doc to delete does not exist!');
  } else if (doc.type !== null) {
    doc.destroy(); // this or doc.del()
    console.log(`doc id: ${docID} deleted!`);
    let documentMap = await DocModel.findOne({ docID });
    if (documentMap) {
      documentMap.destroy(); //TODO : find right function
      console.log('document mapping destroyed!');
    } else {
      console.log(`document mapping doesn't exist`);
    }
  }
};
exports.handleList = (req, res, next) => {
  //async spaghetti code deal with it
  const query = connection.createFetchQuery('docs', {
    $sort: { '_m.mtime': -1 },
    $limit: 10,
  });
  query.on('ready', function () {
    docList = query.results;
    let resList = [];
    docList.foreach(async (item, index) => {
      let name = await DocMode.findOne(doc.id);
      resList.push({ item: item.id, name: name });
    });
  });
  res.write(resList);
};
