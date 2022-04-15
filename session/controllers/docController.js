const connection = require('session').connection


exports.handleDocEdit = (req, res) => {
    // TODO
}

exports.handleDocConnect = (req, res) => {
    const headers = {
        'X-CSE356': '61f9d48d3e92a433bf4fc893',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
    };
    const docID = req.params.DOCID
    const clientID = req.params.UID

    const doc = connection.get('docs', docID)
    doc.subscribe((err) => {
        if (err) console.log(err)
        

    })


}

exports.handleDocOp = (req, res) => {
    // TODO
}

exports.handleDocPresence = (req, res) => {
    // TODO
}

exports.handleDocGet = (req, res) => {
    // TODO
}