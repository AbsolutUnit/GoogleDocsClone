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
const conn = new Connection(socket);

const clientMapping = {};
//also do user name mapping to ???, to attach name to cursor SSE response

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

exports.handleDocConnect = (req, res, next) => {
  const docID = req.params.DOCID;
  const clientID = req.params.UID;

  const headers = {
    'X-CSE356': '61f9d48d3e92a433bf4fc893',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
  };
  res.writeHead(200, headers);
  //TODO set head
  const presence = conn.getDocPresence('docs', docID);
  presence.subscribe();

  const localPresence = presence.create(
    parseInt(Math.random() * 1000000000).toString()
  );
  const doc = conn.get('docs', docID);
  clientMapping[clientID] = {
    presence: localPresence,
    doc: doc,
  };
  doc.subscribe((err) => {
    if (err) res.json({ error: true, message: err });
    console.log('doc is:', doc);
    console.log("Here's doc.data", doc.data);
    const data = `data: ${JSON.stringify({
      content: doc.data.ops,
      version: doc.version,
    })}\n\n`;
    res.write(data);
    doc.on('op', (op, source) => {
      let data = `data: ${JSON.stringify(op)}\n\n`;
      if (source) {
        // source will be untransformed op
        data = `data: ${JSON.stringify({ ack: source })}\n\n`;
      }
      res.write(data);
    });
  });
  presence.on('receive', (id, val) => {
    const { index, length } = val; // no idea what val's shape is
    let data = `data: ${JSON.stringify({
      id: clientID,
      cursor: { index: index, length: length, name: req.session.username },
    })}`;
    res.write(data);
    comsole.log('completed');
  });
};

exports.handleDocOp = (req, res, next) => {
  // const docID = req.params.DOCID;
  console.log('handleDocOP ', req.body);
  const clientID = req.params.UID;
  const doc = clientMapping[clientID].doc;
  console.log('req version: ', req.body.version);
  console.log('doc.version: ', doc.version);
  if (req.body.version < doc.version) {
    res.send(`${JSON.stringify({ status: 'retry' })}`);
    return;
  }
  console.log(req.body);
  console.log('Submitting Op');
  doc.submitOp(req.body.op, { source: req.body.op });
  console.log('After submit, doc.data: ', doc.data);
  res.send(`${JSON.stringify({ status: 'ok' })}`);
};

exports.handleDocPresence = (req, res, next) => {
  const { index, length } = req.body;
  console.log('Presence Updated');
  const docID = req.params.DOCID;
  const clientID = req.params.UID;
  const doc = conn.get('docs', docID);

  const range = {
    index,
    length,
  };

  let localPresence = clientMapping[clientID].presence;
  localPresence.submit(range, function (err) {
    if (err) throw err;
  });
  res.json({});
  res.end();
};

exports.handleDocGet = (req, res, next) => {
  const docID = req.params.DOCID;
  const clientID = req.params.UID;
  const doc = conn.get('docs', docID);
  const deltaOps = doc.data.ops;
  const converter = new QuillDeltaToHtmlConverter(deltaOps, {});
  const html = converter.convert();
  res.send(html);
  res.end();
};
