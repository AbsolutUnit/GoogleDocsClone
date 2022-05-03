// require('dotenv').config();
const WebSocket = require('ws');
const richText = require('rich-text');
const QuillDeltaToHtmlConverter = require('quill-delta-to-html').QuillDeltaToHtmlConverter;
const { convert } = require('html-to-text');
const ShareDB = require('sharedb');
const WebSocketJSONStream = require('@teamwork/websocket-json-stream');
const indexing = require('./indexing')
const DocMapModel = require('./models/Document');
const {v4: uuidv4} = require('uuid');
const { logger } = require('./logger')

const docStoreURI = process.env["DOC_STORE_URI"];
const db = require('sharedb-mongo')(docStoreURI);
ShareDB.types.register(richText.type);
const backend = new ShareDB({
  db: db,
  presence: true,
  doNotForwardSendPresenceErrorsToClient: true,
});
const wss = new WebSocket.Server({ port: parseInt(process.env['PORT']) + 100 });
wss.on('connection', function (ws) {
  var stream = new WebSocketJSONStream(ws);
  backend.listen(stream);
  logger.info(`ShareDB listening on ${parseInt(process.env['PORT']) + 100}`)
});
const connection = backend.connect();


/*
backend.use('submit', (context, next) => {
  logger.debug('Sharedb backend received submission')
  next()
});
*/

// docStore[docId] = {
//    share: sharedb.doc,
//    clients: {clientId: res},
//    presence: presence
// }
const docStore = {};
/**
 * update elasticsearch index
 * @param {*} doc - pass thru as doc.data
 * @param {*} docID 
 * TODO: can def optimize this a LOT
 */
const updateIndex = async (docData, docID) => {
    deltaOps = docData.ops;
    const converter = new QuillDeltaToHtmlConverter(deltaOps, {});
    const html = converter.convert();
    const text = convert(html)
    indexing.updateDocument(text, docID)
    logger.debug('INDEX UPDATED');
}

/**
 * Show the UI for editing a document: /doc/edit/:documentId
 *
 * @param req.params: {documentId}
 * @returns <html>
 */
exports.handleDocEdit = (req, res, next) => {
  let documentID = req.params.DOCID;
  let editPage = `
  <!DOCTYPE html>
  <html>
    <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Backyardigans Doogle Goc UI</title>
          <link href = "https://cdn.quilljs.com/1.3.6/quill.snow.css" rel = "stylesheet">
      </head>
      <body>
          <h1 class = "header">Backyardigans Doogle Gocs Editor</h1>
          <div id = "editor">
      </div>
          <script src="https://cdn.quilljs.com/1.3.6/quill.js"></script>
          <script src="https://cdn.jsdelivr.net/npm/quill-cursors@3.0.0/dist/quill-cursors.js"></script>
          <script>
      Quill.register('modules/cursors', QuillCursors);
      const quill = new Quill('#editor', {
        theme: 'snow',
        modules: {
          cursors: true,
        }
      });

      function generateId() {
        return Date.now();
      }

      const ip = "http://backyardigans.cse356.compas.cs.stonybrook.edu";
      const userId = generateId();
      var clientVersion = 0;
      var deltaQueue = [];
      let ack = false;
      const eventSource = new EventSource(ip + "/doc/connect/" + "${documentID}/" + userId);
      const cursors = quill.getModule('cursors');

      async function flushQueue() {
          if (deltaQueue.length > 0) {
            let currentOp = deltaQueue[0];
            let retry = false;
            let ok = false;
            fetch(ip + "/doc/op/${documentID}/" + userId, {
              method: 'POST',
              body: JSON.stringify({
                version: clientVersion,
                op: currentOp.op
              })
            }).then(res => {
              res.json().then(result => {
                let status = result.status;
                if (status === "ok") {
                  ok = true;
                } else if (status === "retry") {
                  retry = true;
                }
              })
            });
            if (ok) {
              clientVersion += 1;
              deltaQueue = deltaQueue.shift();
            } else if (retry) {
              const currVersion = clientVersion;
              while (currVersion == clientVersion){
                console.log("waiting");
              }
            }
        }
      }


      function handleUpdate(delta, oldDelta, source) {
        if(source !== 'user') {
	    console.log('source is...', source);
	    return;
	}
        console.log("Text Update");
        if (delta) {
          let xhr = new XMLHttpRequest();
          xhr.open("POST", ip + "/doc/op/${documentID}/" + userId)
          xhr.setRequestHeader("Accept", "application/json");
          xhr.setRequestHeader("Content-Type", "application/json");
          let data = {
            version : clientVersion,
            ops : delta.ops
          }
          console.log("data", JSON.stringify(data))
          xhr.send(JSON.stringify(data));

          // fetch(ip + "/doc/op/${documentID}/" + userId, {
          //   method: 'POST',
          //   headers:  {
          //     'Content-Type': 'application/json',
          //     'Accept': 'application/json'
          //   },
          //   body: {
          //     version: JSON.stringify(clientVersion),
          //     ops: JSON.stringify(delta.ops)
          //   }
          // })
        } 
      }

      function handleSendPosition(range) {
        if (range) {
          fetch(ip + "/doc/presence/" + "${documentID}/" + userId, {
            method: 'POST',
            body: JSON.stringify({
              index: range.index,
              length: range.length
            })
          });
        }
      }

      function handleCursorEvent(response) {
        if (response.cursor === null){
          cursors.removeCursor(response.id);
        } else {
          var randomColor = Math.floor(Math.random() * 16777215).toString(16);
          cursors.createCursor(id = response.id, name = response.cursor.name, color = randomColor);
          let position = {index: parseInt(response.cursor.index), length: parseInt(response.cursor.length)}
          cursors.moveCursor(id = response.id, range = position);
        }
      }

      eventSource.onmessage = (e) => {
        flushQueue();
        try {
          const response = JSON.parse(e.data);
	  console.log(response);
          if (response.content) {
            clientVersion = response.version;
            quill.setContents(response.content);
          }
          if (response.id) {
            handleCursorEvent(response);
          }
          if (response.ack) {
            clientVersion = clientVersion + 1;
          }
        }
        catch {
          const response = JSON.parse(e).data;
          for (let op of response) {
            quill.updateContents(op);
          }
        }
      }
      
      quill.on('text-change', handleUpdate);
      quill.on('selection-change', handleSendPosition);
      </script>
      </body>
  </html>`;
  res.send(editPage);
};

/**
 * Connect to this server to receive document operations with HTML server side events.
 *
 * @param req.params: {documentId, clientId}
 * @returns an event stream containing the document data.
 */
exports.handleDocConnect = (req, res) => {
  const docID = req.params.DOCID;
  const clientID = req.params.UID;

  const doc = docStore[docID];
  // Sometimes we may be editing a document that came from mongodb, so it wasnt created this session.
  if (doc === undefined) {
    docStore[docID] = {};
    share = connection.get("docs", docID);
    docStore[docID].share = share;
    docStore[docID].clients = {};
    docStore[docID].presence = connection.getDocPresence("docs", docID);
    docStore[docID].version = share.version;
  }
  const presence = doc.presence;
  const localPresence = presence.create(clientID);

  // sse headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
  };
  res.writeHead(200, headers);

  // Get content of document from the mapping.
  res.write(`data: ${JSON.stringify({content: doc.share.data.ops, version: doc.version})}\n\n`);

  // Store response object as a client.
  doc.clients[clientID] = {res};

  // Listen for presence
  presence.subscribe()
  presence.on('receive', function(id, cursor) {
    if (id != clientID) {
      res.write(`data ${JSON.stringify({presence: {id: id, cursor: cursor}})}\n\n`);
    }
  });

  doc.share.subscribe((err) => {
    if (err) res.json({ error: true, message: err });
    let data = `data: ${JSON.stringify({
      content: doc.share.data.ops,
      version: doc.version,
    })}\n\n`;
    res.write(data)
    doc.share.on('op', (op, source) => {
      if (op.ops) op = op.ops
      let data = `data: ${JSON.stringify(op)}\n\n`;
      if (source.clientID == clientID) {
        data = `data: ${JSON.stringify({ ack: source.op })}\n\n`;
      }
      res.write(data)
    });
  });

  // Closing handlers.
  req.on('close', (msg) => {
    logger.warn(`request closed. msg=${msg}`)
    localPresence.submit({cursor: null}, function(err) {
      if (err) throw err;
    });
    localPresence.destroy();
    delete doc.clients[clientID];
    if (doc.clients == {}) {
      delete doc;
    }
  });
};

/**
 * Submit a new change to the document.
 *
 * @param req.params {documentId, clientId}
 * @param req.body {version, op}
 * @returns req.json: { status }
 */
exports.handleDocOp = (req, res) => {
  const docID = req.params.DOCID;
  const clientID = req.params.UID;

  const doc = docStore[docID];
  if (doc === undefined) {
    logger.error("document does not exist");
    res.json({ status: 'error', message: 'document does not exist.' });
    return;
  }
  logger.silly(`(BEFORE OP): doc.version=${doc.version},
      req.body.version=${req.body.version}`)
  if (req.body.version < doc.version) {
    logger.warn(`retry: doc: ${doc.version} req: ${req.body.version} client: ${clientID}`);
    res.send(`${JSON.stringify({ status: 'retry' })}`);
    return;
  }
  logger.info('Submitting Op');
  const source = {
    clientID: clientID,
    op: req.body.op,
  };

  /*
  doc.share.submitOp(req.body.op, { source: source }, (error) => {
    logger.info('submitOp callback')
    if (error) {
      res.json({status: 'error', message: error});
    } else {
      doc.version += 1;
      logger.silly(`(AFTER OP): doc.version=${doc.version}`)
      // Write to our source.
      if (doc.clients[clientID] !== undefined) {
        doc.clients[clientID].res.write(`data: ${JSON.stringify({ack: req.body.op})}\n\n`);
        // Write to the rest of them.
        let clis = Object.keys(doc.clients);
        for (let i = 0; i < clis.length; i++) {
          if(clis[i] != clientID)
            doc.clients[clis[i]].res.write(`data: ${JSON.stringify(req.body.op)}\n\n`);
        }
      }
    }
  });
  */

  doc.share.submitOp(req.body.op, { source: source }); // there is an optional callback, but not using for now
  doc.version += 1
  logger.silly(`(AFTER OP): doc.version=${doc.version}`)

  // completely bypass sharedb
  /*
  doc.version += 1
  logger.info(`(AFTER OP): doc.version=${doc.version}`)
  if (doc.clients[clientID]) {
    doc.clients[clientID].res.write(`data: ${JSON.stringify({ack: req.body.op})}\n\n`);
    // Write to the rest of them.
    let clis = Object.keys(doc.clients);
    for (let i = 0; i < clis.length; i++) {
      if(clis[i] != clientID)
        doc.clients[clis[i]].res.write(`data: ${JSON.stringify(req.body.op)}\n\n`);
    }
  }
  */
    
  const updateFrequency = 25; // lower = more frq update
  const initialUpdates = 3;
  // will update every time for first few ops
  if (doc.version < initialUpdates || !(doc.version % updateFrequency)) {
    logger.info("Updating document index.");
    updateIndex(doc.share.data, docID);
  }

  res.send(`${JSON.stringify({ status: 'ok' })}`);
};

/**
 * Submit a new cursor position and selection length to the document.
 *
 * @param req.params {documentId, clientId}
 * @param req.body {index, length}
 * @returns req.json: {}
 * */
exports.handleDocPresence = (req, res, next) => {
  const docID = req.params.UID;
  const clientID = req.params.UID;
  const { index, length } = req.body;

  const doc = docStore[docID];
  if (!(doc != undefined && doc.presence === undefined)) {
    res.json({error: true, message: "presence endpoint called without any document created."});
  }

  const localPresence = docStore[docID].presence.create(clientID)
  const cursor = {
    index,
    length,
  };

  localPresence.submit(cursor, function (err) {
    if (err) throw err;
    logger.info("submitted presence to sharedb")
  });
  res.json({});
};

/**
 * Get the document represented as HTML.
 * @param req.params {documentId, clientId}
 * @returns <html>
 */
exports.handleDocGet = (req, res, next) => {
  const docID = req.params.DOCID;
  const clientID = req.params.UID;
  // NOTE: notice there is no doc.fetch here...
  // TODO: optimize!
  const doc = connection.get('docs', docID);
  const deltaOps = doc.data.ops;
  const converter = new QuillDeltaToHtmlConverter(deltaOps, {});
  const html = converter.convert();
  res.send(html);
};

/**
 * Create a new document (collection) to be edited.
 *
 * @param req.body { name }
 * @returns req.json: {docId}
 */
 exports.handleCreate = (req, res, next) => {
  const { name: name } = req.body;
  // create the document ID to
  const docID = `${process.env["SHARD_ID"]}-${process.env["PORT"]}-${uuidv4()}`;
  let doc = connection.get('docs', docID);
  doc.fetch(async function (err) {
    if (err) throw err;
    if (doc.type === null) {
      doc.create([{ insert: '\n' }], 'rich-text');
      indexing.addDocument(docID, name, '\n')
      let documentMap = new DocMapModel({
        docName: name,
        docID,
      });
      
      documentMap.save(function (err) {
        if (err) {
          logger.error(`Errored out on create: ${JSON.stringify(err)}`);
          res.json({ error: true, message: "couldn't save the document map" });
          return;
        }
      });
    }});
  doc.subscribe((error) => {
    if (error) {
      logger.warn(`could not subscribe to doc error ${error}`);
    }
  });

  docStore[docID] = {};
  docStore[docID].share = doc;
  docStore[docID].clients = {};
  docStore[docID].presence = connection.getDocPresence("docs", docID);
  docStore[docID].version = 0;

   res.json({ docid: `${docID}` });
};

/**
 * Delete a document from the server.
 *
 * @param req.body { docid }
 * @returns res.json { status }
 */
exports.handleDelete = async (req, res, next) => {
  const { docid: docID } = req.body;
  const doc = connection.get('docs', docID);
  doc.fetch(async function (err) {
    if (err) throw err;
    if (doc.type === null) {
      res.json({ error: true, message: 'Could not delete document.' });
      return;
    } else if (doc.type !== null) {
      doc.del(); // this or doc.del()
      logger.info(`doc id: ${docID} deleted!`);
      DocMapModel.deleteOne({ docID }, function (err) {
        if (err) {
          logger.info(`Error on Delete: ${JSON.stringify(err)}`);
          res.json({ error: true, message: 'Could not delete document.' });
          return;
        }
      });
    }
  });
  res.json({});
};

/**
 * Get the list of the ten most recently modified documents.
 *
 * @returns req.json [{ id, name }]
 */
exports.handleList = (req, res, next) => {
  exports.getTopTen(function (resList) {
    res.json(resList);
  });
};

/**
 * Get the top 10 most recently modified documents from ShareDB.
 *
 * @param callback
 * @returns none, but calls the callback
 * TODO: what happens when doc service distributed?
 */
exports.getTopTen = (callback) => {
  const query = connection.createFetchQuery('docs', {
    $sort: { '_m.mtime': -1 },
    $limit: 10,
  });
  let resList = [];
  query.on('ready', async function () {
    let docList = query.results;
    for (const doc of docList) {
      let name = await DocMapModel.findOne({ docID: doc.id });
      resList.push({ id: doc.id, name: name.docName });
    }
    callback(resList);
  });
};

