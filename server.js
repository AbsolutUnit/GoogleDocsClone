import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import sharedb from "sharedb";
import ws from "ws";
// server setup
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static('client')); // serve static files

// data structures
const clients = [];

// endpoints
app.get('/connect/:id', handleConnect);
app.get('op/:id', handleOp);
app.get('/doc/:id', handleDoc);

const server = app.listen(8080, () => { console.log("Listening on port 8080") })
const wsServer = ws.Server({server: server});

const backend = new sharedb()


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


}
