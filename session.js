import express, { response } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import ReconnectingWebSocket from 'reconnecting-websocket';
const Client = require('sharedb/lib/client')
const Connection = Client.Connection;
const richText = require('rich-text');
import dhtml from "quill-delta-to-html"

Client.types.register(richText.type)

// server setup
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static('client')); // serve static files

// sharedb websocket connection setup
const socket = new ReconnectingWebSocket('ws://localhost:8081')
const connection = new Connection(socket)

// data structures
const clients = {};

// endpoints
app.get('/connect/:id', handleConnect);
app.post('op/:id', handleOp);
app.get('/doc/:id', handleDoc);

app.listen(8080, () => { console.log("Listening on port 8080") });

// handlers

function handleConnect(req, res, next) {
    // get client id
    clientID = req.params.id

    // response settings
    const headers = {
        "X-CSE356": "61f9d48d3e92a433bf4fc893",
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    };
    response.writeHead(200, headers);


    const doc = connection.get("docs", "1")
    doc.subscribe((error) => {
        if (error) return console.log(error)

        if (!doc.type) {
            doc.create([{insert: '\n'}], 'http://sharejs.org/types/rich-text/v1', (error) => {
                if (error) console.log(error)
            })
        } else { // if doc does exist...
            console.log("doc.data: ", doc.data)
            response.write({data: {content: doc.data}}, (error) => { console.log(error) })
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
        response.write({data: op})
    })
}

function handleOp (req, res, next) {
    console.log("handleOp req.body: ", req.body)
    const clientID = req.params.id // should we check to make sure this client exists? How do that?
    console.log("clients[clientID]: ", clients[clientID])
    clients[clientID].doc.submitOp(req.body)
}

function handleDoc(req, res, next) {
    console.log("handleDoc req.body: ", req.body)
    clientID = req.params.id
    console.log("clients[clientID]: ", clients[clientID])
}