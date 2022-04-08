const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const WebSocket = require('ws')
const QuillDeltaToHtmlConverter = require('quill-delta-to-html').QuillDeltaToHtmlConverter;
const Client = require('sharedb/lib/client')
const richText = require('rich-text');

const Connection = Client.Connection;
Client.types.register(richText.type)

// server setup
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static('client')); // serve static files

// sharedb websocket connection setup
var socket = new WebSocket('ws://localhost:8081')
const connection = new Connection(socket)

// create doc
const doc = connection.get("docs", "1")
doc.create([{insert: '\n'}], 'http://sharejs.org/types/rich-text/v1')

// data structures
const clients = {};

// endpoints
app.get('/connect/:id', handleConnect);
app.post('/op/:id', handleOp);
app.get('/doc/:id', handleDoc);

app.listen(8080, () => { 
    // console.log("Listening on port 8080") 
});

function handleConnect(req, res, next) {
    console.log("handleConnect")
    // get client id
    const clientID = req.params.id
    // console.log("req: ", req)

    // response settings
    const headers = {
        "X-CSE356": "61f9d48d3e92a433bf4fc893",
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    };
    res.writeHead(200, headers);
    res.flushHeaders()

    doc.subscribe((error) => {
        if (error) return console.log(error)
        const data = `data: ${JSON.stringify({content: doc.data.ops})}\n\n`
        console.log("doc data", data)
        res.write(data)
    })
    
    // add client to clients data structure if not already in there
    clients[clientID] = {
        clientID,
        doc
    }

    // listen for transformed ops
    doc.on('op', (op) => { // think about op batch
        console.log("transformed op ", op)
        const data = `data: ${JSON.stringify({ops: op})}\n\n`
        res.write(data)
    })
}

function handleOp(req, res, next) {
    console.log("op req.body ", req.body) 
    // console.log("handleOp req.body ", req.body)
    const clientID = req.params.id // should we check to make sure this client exists? How do that?
    // console.log("clients[clientID]: ", clients[clientID].clientID)
    for (let op of req.body) {
        console.log("op to be submitted ", op)
        clients[clientID].doc.submitOp(op)
    }
}

function handleDoc(req, res, next) {
    const headers = {
        "X-CSE356": "61f9d48d3e92a433bf4fc893",
        'Access-Control-Allow-Origin': '*',
    };
    res.writeHead(200, headers);
    // console.log("handleDoc req.body: ", req)
    const clientID = req.params.id;
    //console.log("clients[clientID]: ", clients[clientID].clientID)
    const doc = connection.get("docs", "1");
    const deltaOps = doc.data.ops
    //console.log("deltaOps", deltaOps)
    const cfg = {};
    const converter = new QuillDeltaToHtmlConverter(deltaOps, cfg);
    const html = converter.convert(); 
    // console.log("html ", html);
    res.end(html);
}
