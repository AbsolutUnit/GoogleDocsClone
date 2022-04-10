const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const WebSocket = require('ws')
const ReconnectingWebSocket = require('reconnecting-websocket')
const wsOptions = {WebSocket : WebSocket}
const QuillDeltaToHtmlConverter = require('quill-delta-to-html').QuillDeltaToHtmlConverter;
const Client = require('sharedb/lib/client')
const richText = require('rich-text');
const session = require('express-session')
const MongoDBSession = require('connect-mongodb-session')(session)
const mongoose = require('mongoose');

const Connection = Client.Connection;
Client.types.register(richText.type)

const UserModel = require('./User')

const mongoURI = 'mongodb+srv://kevinchao:fJkTywtN4BmDnL1x@cluster0.28ur3.mongodb.net/sessions?retryWrites=true&w=majority'
mongoose.connect(mongoURI, {
    useNewURLParser: true,
    //useCreateIndex: true,
    useUnifiedTopology: true
}).then(res => {
    console.log("MongoDB connected")
})
const store = new MongoDBSession({
    uri: mongoURI,
    collection: "mySessions"
})

// server setup & middleware
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
//app.use(express.static(__dirname + '../client'));
app.use(express.static('../client')); // serve static files
app.use(express.urlencoded({extended: true}))
app.use(
    session({
        secret: 'some key',
        resave: false,
        saveUninitialized: false,
        store: store
    })
)

//middleware for maintaining login state
//pass this middleware into any webpage that requires authentication
const isAuth = (req, res, next) => {
    if(req.session.isAuth) {
        next()
    } else {
        console.log('not logged in!')
        res.redirect('/')
    }
}

// sharedb websocket connection setup
const socket = new ReconnectingWebSocket('ws://localhost:8081', [], wsOptions)
const connection = new Connection(socket)


// data structures
const clients = {};

// endpoints
app.get('/connect/:id', handleConnect);
app.post('/op/:id', isAuth, handleOp);
app.get('/doc/:id', isAuth, handleDoc);
app.post('/testcon', handleTestCon);
app.get('/', handleStart)
app.post('/addUser', handleAddUser)
app.post('/login', handleLogin)
app.post('/logout', handleLogout)


app.listen(8080, () => { 
    console.log("Listening on port 8080") 
});

//assumes body has user, password.
async function handleAddUser(req, res, next) {
    //TODO add error handling for missing password or username
    const {username, password} = req.body
    //assume users create unique usernames
    let user = await UserModel.findOne({username})
    if (user) {
        console.log('username already taken!')
        res.end()
        return
    }
    user = new UserModel({
        username,
        password // TODO: do i want to encrypt this password
    })
    await user.save()
    console.log('user saved')
    res.end()
}

async function handleLogin(req, res, next) {
    const {username, password} = req.body
    const user = await UserModel.findOne({username});

    if(!user) {
        console.log("User does not exist!")
    } else if (password != user.password) {
        console.log("Wrong Password")
    } else {
        console.log("Successful login")
        req.session.isAuth = true
    }
    res.end()
    return

}

function handleLogout(req, res, next) {
    console.log('logout called')
    req.session.destroy((err) => {
        if(err) throw err
        res.redirect('/')
    })
}

//testing function for purely adding cookie
function handleTestCon(req, res, next) {
    req.session.isAuth = true
    res.set('X-CSE356','61f9d48d3e92a433bf4fc893');
    //res.cookie('warm baked cookie', req.session.id) // cookie-parser is probably not necesary
    res.send("hi welcome")
    //console.log(req.session)
    console.log("cookie id generated: ", req.session.id)
}

function handleStart(req, res, next) {
    //req.session.isAuth = true;
    //res.sendFile(path.join(__dirname, '../client/index.html'));
}

function handleConnect(req, res, next) {
    console.log("handleConnect called")
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
    // res.flushHeaders()

    const doc = connection.get('docs', '1');

    doc.subscribe((error) => {
        if (error) return console.log(error)
        const data = `data: ${JSON.stringify({content: doc.data.ops})}\n\n`
        //console.log("doc data", data)
        res.write(data)

        doc.on('op', (op) => { // think about op batch
            //console.log("transformed op ", op)
            const data = `data: ${JSON.stringify([op])}\n\n`
            res.write(data)
        })
    })
    
    // add client to clients data structure if not already in there
    clients[clientID] = {
        clientID,
        doc
    }
}

function handleOp(req, res, next) {
    //console.log("op req.body ", req.body) 
    // console.log("handleOp req.body ", req.body)
    const clientID = req.params.id // should we check to make sure this client exists? How do that?
    // console.log("clients[clientID]: ", clients[clientID].clientID)
    for (let op of req.body) {
        //console.log("op to be submitted ", op)
        clients[clientID].doc.submitOp(op)
    }

    res.end()
}

function handleDoc(req, res, next) {
    res.set('X-CSE356','61f9d48d3e92a433bf4fc893');
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
    res.send(html);
}
