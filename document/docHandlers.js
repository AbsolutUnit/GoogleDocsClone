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

const socket = new ReconnectingWebSocket('ws://localhost:8081', [], wsOptions);
const conn = new Connection(socket);

const clientMapping = {};
const docVersionMapping = {};
var docVersion = 0;
//also do user name mapping to ???, to attach name to cursor SSE response

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

  const doc = conn.get('docs', docID);
  const presence = conn.getDocPresence('docs', docID);
  const localPresence = presence.create(clientID);
  // set doc version in case new doc
  if (docVersionMapping[docID] === undefined) {
    docVersionMapping[docID] = 0;
    docVersion = 0;
  } else {
    docVersion = docVersionMapping[docID];
  }
  // sse headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
  };
  res.writeHead(200, headers);
  // presence.subscribe(function(error) {
  //   if (error) throw error;
  // });
  // presence.on('receive', (id, val) => {
  //   const { index, length } = val; // no idea what val's shape is
  //   console.log("Presence object: " + val);
  //   let data = `data: ${JSON.stringify({
  //     presence: {
  //       id: id,
  //       cursor: { index: index, length: length, name: req.session.username },
  //     }
  //   })}`;
  //   console.log("Session Name: " + req.session.username);
  //   res.write(data);
  //   console.log('completed');
  // });
  // store new client
  clientMapping[clientID] = {
    doc: doc,
    presence: localPresence,
    res: res,
    name: req.session.username,
  };
  doc.subscribe((err) => {
    if (err) res.json({ error: true, message: err });
    console.log('doc.data in doc.subscribe: ', doc.data);
    let data = `data: ${JSON.stringify({
      content: doc.data.ops,
      version: docVersion,
    })}\n\n`; // can switch bw doc.version and docVersion
    console.log('event stream data (contents,version): ', data);
    res.write(data);
    doc.on('op', (op, source) => {
      // source is truthy when we submitted the op.
      // hence, if this is our own op, send an ack.
      if (!source) {
        data = `data: ${JSON.stringify({ ack: source.op })}\n\n`;
        res.write(data);
      } else {
        data = `data: ${JSON.stringify(op)}\n\n`;
        res.write(data);
      }
    });
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
  console.log('handleDocOP ', req.body);
  const clientID = req.params.UID;
  const doc = clientMapping[clientID].doc;
  console.log('req version: ', req.body.version);
  console.log('(our) doc.version: ', docVersion);
  console.log('(sharedb) doc.version: ', doc.version);
  if (docVersionMapping[docID] === undefined) {
    docVersionMapping[docID] = 0;
    docVersion = 0;
  } else {
    docVersion = docVersionMapping[docID];
  }
  if (req.body.version < docVersion) {
    // can switch bw doc.version and docVersion
    res.send(`${JSON.stringify({ status: 'retry' })}`);
    return;
  }
  console.log('Submitting Op');
  const source = {
    clientID: clientID,
    op: req.body.op,
  };
  doc.submitOp(req.body.op, { source: source });
  docVersionMapping[docID] = docVersionMapping[docID] + 1;
  console.log('After submit, doc.data: ', doc.data);
  console.log('After submit, (our) doc version: ', docVersion);
  console.log('After submit, (sharedb) doc version: ', doc.version);
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
  const { index, length } = req.body;
  const docID = req.params.DOCID;
  const clientID = req.params.UID;
  const doc = clientMapping[clientID].doc;

  const range = {
    index,
    length,
  };

  const headers = {
    'X-CSE356': process.env['CSE_356_ID'],
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
  };
  // super hacky: just go thru clients and echo presence back
  for (let client in clientMapping) {
    const data = `data: ${JSON.stringify({
      presence: {
        id: clientID,
        cursor: { index: index, length: length, name: req.session.username },
      },
    })}\n\n`;
    console.log('hacky presence ES data: ', data);
    console.log('cursed res: ', client.res);
    clientMapping[client].res.write(data);
  }
  // let data = `data: ${JSON.stringify({
  //   presence: {
  //     id: clientID,
  //     cursor: { index: index, length: length, name: req.session.username },
  //   }
  // })}`;
  // console.log("Session Name: " + req.session.username);
  // res.write(data);

  // console.log("localPresence obj before submitting to localPresence: ", localPresence)
  // localPresence.submit(range, function (err) {
  //   if (err) throw err;
  //   console.log("submitted presence to sharedb")
  // });
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
  const doc = conn.get('docs', docID);
  const deltaOps = doc.data.ops;
  const converter = new QuillDeltaToHtmlConverter(deltaOps, {});
  const html = converter.convert();
  res.send(html);
};
