const multer = require('multer');
const fs = require('fs');
var path = require('path');
const mime = require('mime');

//THESE ARE NOT PERSISTENT
let pathMapping = new Map();
let mimeMapping = new Map();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, '/root/finaljs/session/uploads');
  },
  filename: (req, file, cb) => {
    let mediaID = parseInt(Math.random() * 1000000000).toString();
    cb(null, mediaID + path.extname(file.originalname));
  },
});

exports.upload = multer({ storage });

exports.handleUpload = (req, res, next) => {
  // console.log(req.file);
  pathMapping.set(path.parse(req.file.filename).name, req.file.path);
  mimeMapping.set(path.parse(req.file.filename).name, req.file.mimetype);
  res.json({ mediaid: req.file.filename });
  res.end();
};

exports.handleAccess = (req, res, next) => {
  const mediaID = req.params.MEDIAID;

  filePath = pathMapping.get(mediaID);

  res.header('Content-Type', mimeMapping.get(mediaID));
  res.sendFile(filePath, {}, function (err) {
    if (err) {
      res.json({ error: true, message: "couldn't send file" });
    } else {
      console.log(`${filePath} sent!`);
    }
    res.end();
  });

  // fs.readFile(filePath, 'utf8', (err, data) => {
  //   if (err) {
  //     console.error(err);
  //     return;
  //   }
  //   //console.log(data);
  //   res.header('Content-Type', mimeMapping.get(mediaID));
  //   res.write(data);
  //   res.end();
  // });
};
