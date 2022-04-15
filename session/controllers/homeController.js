const WebSocket = require('ws');
const ReconnectingWebSocket = require('reconnecting-websocket');
const wsOptions = { WebSocket: WebSocket };
const Client = require('sharedb/lib/client');
const richText = require('rich-text');

const Connection = Client.Connection;
const collectionController = require('./collectionController');
Client.types.register(richText.type);

const DocMapModel = require('../Models/Document');

const socket = new ReconnectingWebSocket('ws://localhost:8081', [], wsOptions);
const connection = new Connection(socket);

exports.handleHome = (req, res, next) => {
  let rankingOfKings = collectionController.getTopTen();
  const hyperlinks = rankingOfKings.map(
    (x) =>
      `<a href = "/doc/edit/${String(x)}">Edit Document with ID ${String(
        x
      )}</a>`
  );
  let homePage = `
        <!DOCTYPE html>
        <html>
            <head>
                <title>Backyardigans Doogle Gocs</title>
                <link rel = "stylesheet" href = "home.css">
                <script>
                    var form = document.getElementById("createDoc");
                    document.getElementById("submissionButton").addEventListener("click", function () {
                        form.submit();
                    });

                    document.getElementById("logout").addEventListener("click", function () {
                        fetch("http://localhost:8080/users/logout", {
                            method: "POST"
                        });
                    });
                </script>
            </head>
            <body>
                <h1 class = "header">Backyardigans Doogle Gocs</h1>
                <form id = "createDoc">
                    <input type = "text" name = "docId" value = "">
                </form>
                <button id = "submissionButton">Create Documentational Document</button>
                ${hyperlinks}
                <button id = "logout">Logout of Your Account</button>
            </body>
        </html>`;
  res.send(homePage);
  res.end();
};
