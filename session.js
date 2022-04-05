import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import ReconnectingWebSocket from 'reconnecting-websocket';
const Connection = require('sharedb/lib/client').Connection;
const richText = require('rich-text');s

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
const clients = [];

// endpoints
app.get('/connect/:id', handleConnect);
app.get('op/:id', handleOp);
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
            doc.create()
        }
    })

}