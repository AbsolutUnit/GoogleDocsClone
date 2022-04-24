require('dotenv').config()
const Client = require('sharedb/lib/client');
const richText = require('rich-text');

const getTopTen = require('./docHandlers').getTopTen
Client.types.register(richText.type);

/**
 * Show the homepage. User will be logged in.
 * @returns <html>
 */
exports.handleHome = (req, res, next) => {
  const hyperlinksFunc = (rankings) =>
    rankings.map(
      (x) =>
        `<a href = "/doc/edit/${String(x)}">Edit Document with ID ${String(
          x
        )}</a>`
    );
  let hyperlinks = getTopTen(hyperlinksFunc);

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
                        fetch("http://${process.env['HOST']}/users/logout", {
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
};
