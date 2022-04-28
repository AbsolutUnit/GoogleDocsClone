// require('dotenv').config();
const WebSocket = require('ws');
const richText = require('rich-text');
const QuillDeltaToHtmlConverter = require('quill-delta-to-html').QuillDeltaToHtmlConverter;
const { convert } = require('html-to-text');
const ShareDB = require('sharedb');
const WebSocketJSONStream = require('@teamwork/websocket-json-stream');
const { v4: uuidv4 } = require('uuid');
const indexHandlers = require('./indexHandlers')
const DocMapModel = require('./models/Document');
const { logger } = require('./logger')


const mongoURI = process.env["MONGO_URI"];
const db = require('sharedb-mongo')(mongoURI);
ShareDB.types.register(richText.type);
const backend = new ShareDB({
  db: db,
  presence: true,
  doNotForwardSendPresenceErrorsToClient: true,
});
const wss = new WebSocket.Server({ port: 8082 });
wss.on('connection', function (ws) {
  var stream = new WebSocketJSONStream(ws);
  backend.listen(stream);
logger.info("ShareDB listening on 8082")
});
const connection = backend.connect();

// custom data structures
const docVersionMapping = {};
const lastUpdated = {};
const localPresenceStore = {};

/**
 * update elasticsearch index
 * @param {*} doc 
 * @param {*} docID 
 */
const updateIndex = async (doc, docID) => {
  doc.fetch((err) => {
    if (err) throw err
    const deltaOps = doc.data.ops;
    const converter = new QuillDeltaToHtmlConverter(deltaOps, {});
    const html = converter.convert();
    const text = convert(html)
    indexHandlers.updateDocument(text, docID)
    logger.info('INDEX UPDATED MOTHERFUCKER')
  });
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
exports.handleDocConnect = (req, res, next) => {
  const docID = req.params.DOCID;
  const clientID = req.params.UID;
  const doc = connection.get('docs', docID);
  const presence = connection.getDocPresence('docs', docID);
  const localPresence = presence.create(clientID);
  // set doc version in case new doc
  var docVersion = 0;
  if (docVersionMapping[docID] === undefined) {
    docVersionMapping[docID] = doc.version;
    docVersion = doc.version;
  } else {
    docVersion = docVersionMapping[docID];
  }
  // sse headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
  };
  res.writeHead(200, headers);
  // add client to our jank ass data structure
  localPresenceStore[clientID] = {
    presence: localPresence,
  };
  // subscribe to doc and listen for transformed ops
  doc.subscribe((err) => {
    if (err) res.json({ error: true, message: err });
    logger.info(`doc.data in doc.subscribe: ${JSON.stringify(doc.data)}`);
    let data = `data: ${JSON.stringify({
      content: doc.data.ops,
      version: docVersion,
    })}\n\n`; // can switch bw doc.version and docVersion
    res.write(data);
    doc.on('op', (op, source) => {
      if (op.ops) op = op.ops // because sharedb is stupid
      let data = `data: ${JSON.stringify(op)}\n\n`;
      if (source.clientID == clientID) {
        data = `data: ${JSON.stringify({ ack: source.op })}\n\n`;
      }
      res.write(data);
    });
  });
  doc.on('op', (op, source) => {
    if (op.ops) op = op.ops // because sharedb is stupid
    let data = `data: ${JSON.stringify(op)}\n\n`;
    if (source.clientID == clientID) {
      data = `data: ${JSON.stringify({ ack: source.op })}\n\n`;
    }
    res.write(data);
  });
  // handle presence updates from sharedb
  /*
  presence.subscribe()
  backend.use('sendPresence', (context, next) => {
    // check presence id matches docID
    logger.info(`context.presence.d: ${docID}`) // p sure .d is docID, need to find out tho
    if (context.presence.d !== docID) return 
    let data = `data: ${JSON.stringify({presence: {id: context.presence.id, cursor: context.presence.p }})}\n\n`
    res.write(data)
  });
  */
  // if nothing is going on, update the index
  doc.whenNothingPending(() => {
    updateIndex(doc, docID)
  })

  req.on('close', (msg) => {
    logger.warn(`request closed. msg=${msg}`)
    presence.destroy()
    // doc.removeListener() // this is an error
    doc.destroy()
    delete localPresenceStore[clientID]
    delete docVersionMapping[docID]
  });
  req.on('end', (msg) => {
    logger.warn(`request ended. msg=${msg}`)
  });
};

/**
 * Submit a new change to the document.
 *
 * @param req.params {documentId, clientId}
 * @param req.body {version, op}
 * @returns req.json: { status }
 */
exports.handleDocOp = (req, res, next) => {
  const docID = req.params.DOCID;
  const clientID = req.params.UID;
  const doc = connection.get('docs', docID);
  if (docVersionMapping[docID] === undefined) {
    docVersionMapping[docID] = doc.version;
    docVersion = doc.version;
  } else {
    docVersion = docVersionMapping[docID];
  }
  if (req.body.version < docVersion) {
    // can switch bw doc.version and docVersion
    res.send(`${JSON.stringify({ status: 'retry' })}`);
    return;
  }
  logger.info('Submitting Op');
  const source = {
    clientID: clientID,
    op: req.body.op,
  };
  doc.submitOp(req.body.op, { source: source });
  docVersionMapping[docID] = docVersionMapping[docID] + 1;
  // periodically update index 
  /*
  const lastTimestamp = lastUpdated[docID];
  const currTime = Date.now() / 1000;
  if ((currTime - lastTimestamp) >= 10) {
    updateIndex(doc, docID);
    lastUpdated[docID] = currTime;
  }
  */
   
  const updateFrequency = 15 // lower = more frq update
  if (!(docVersion % updateFrequency)) {
    updateIndex(doc, docID)
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
  // no longer doing hacky presence business
  // but if necessary feel like we can go back to it
  // slim chance Ferdman makes presence grading stricter
  const { index, length } = req.body;
  const clientID = req.params.UID;
  const localPresence = localPresenceStore[clientID].presence
  const range = {
    index,
    length,
  };
  localPresence.submit(range, function (err) {
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
  const docID = uuidv4();
  let doc = connection.get('docs', docID);
  doc.fetch(async function (err) {
    if (err) throw err;
    if (doc.type === null) {
      doc.create([{ insert: '\n' }], 'rich-text');
      indexHandlers.addDocument(docID, name, '\n')
      /*
      setTimeout(() => {
        updateIndex(doc, docID)
      }, 5000)
      setTimeout(() => {
        updateIndex(doc, docID)
      }, 10000)
      setTimeout(() => {
        updateIndex(doc, docID)
      }, 20000);
      */
      let documentMap = new DocMapModel({
        docName: name,
        docID,
      });
      
      documentMap.save(function (err) {
        if (err) {
          logger.info(`Errored out on create: ${JSON.stringify(err)}`);
          res.json({ error: true, message: "couldn't save the document map" });
          return;
        }
      });
    }});

  res.json({ docid: docID });
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

