const express = require("express");
// const SSE = require("express-sse")
// const compression = require("compression")
// const sseExpress = require("sse-express");
const bodyParser = require("body-parser");
const cors = require("cors");
const WebSocket = require('ws')
// const QuillDeltaToHtmlConverter = require("quill-delta-to-html");
const QuillDeltaToHtmlConverter = require('quill-delta-to-html').QuillDeltaToHtmlConverter;
const Client = require('sharedb/lib/client')
const richText = require('rich-text');

const Connection = Client.Connection;
Client.types.register(richText.type)

// server setup
const app = express();
// app.use( compression() )
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static('client')); // serve static files

// sharedb websocket connection setup
var socket = new WebSocket('ws://localhost:8081')
const connection = new Connection(socket)

// data structures
const clients = {};

// endpoints
app.get('/connect/:id', handleConnect);
app.post('/op/:id', handleOp);
app.get('/doc/:id', handleDoc);

app.listen(8080, () => { console.log("Listening on port 8080") });

// handlers

// const doc = connection.get("docs", "1")
// if (!doc.type) {
//     doc.create([{insert: '\n'}], 'http://sharejs.org/types/rich-text/v1', (error) => {
//         if (error) console.log(error)
//     })
// }
// const sse = new SSE(doc.data) // doc.data.ops

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

    const doc = connection.get("docs", "1")
    doc.subscribe((error) => {
        if (error) return console.log(error)

        // sse.send(JSON.stringify({data: {content: doc.data.ops}}))

        
        if (!doc.type) {
            doc.create([{insert: '\n'}], 'http://sharejs.org/types/rich-text/v1', (error) => {
                if (error) console.log(error)
            })
        } else { // if doc does exist...
            console.log("doc.data: ", doc.data)
            res.write("data: " + JSON.stringify({data: {content: doc.data.ops}}) + "\n\n", (error) => { console.log('error: ', error) })
            // res.flush()
            // res.flushHeaders()
        }
    })

    // add client to clients data structure if not already in there
    clients[clientID] = {
        clientID,
        doc
    }

    // listen for transformed ops
    doc.on('op', (op) => { // think about op batch
        console.log("op", op)
        // sse.send(JSON.stringify({data: op}))
        res.write("data: " + JSON.stringify({data: op}) + "\n\n")
        // res.flush()
        // res.flushHeaders()
    })
}

function handleOp (req, res, next) {
    // console.log("handleOp req.body: ", req)
    const clientID = req.params.id // should we check to make sure this client exists? How do that?
    console.log("clients[clientID]: ", clients[clientID].clientID)
    clients[clientID].doc.submitOp(req.body)
}

async function handleDoc(req, res, next) {

    const headers = {
        "X-CSE356": "61f9d48d3e92a433bf4fc893",
        'Access-Control-Allow-Origin': '*',
    };
    res.writeHead(200, headers);
    // console.log("handleDoc req.body: ", req)
    const clientID = req.params.id
    //console.log("clients[clientID]: ", clients[clientID].clientID)
    const doc = connection.get("docs", "1")
    const deltaOps = doc.data.ops
    //console.log("deltaOps", deltaOps)
    const cfg = {}
    // const QuillDeltaToHtmlConverter = await require("quill-delta-to-html");
    const converter = new QuillDeltaToHtmlConverter(deltaOps, cfg);
    const html = converter.convert(); 
    console.log("html", html);
    res.end(html)
    // res.flush()
}