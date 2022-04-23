const multer = require('multer');
var path = require('path');

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

/**
 * Upload a media file to the server, so that it can be accessed later.
 *
 * @param req.file the file to upload
 * @return req.json: { mediaId }
 */
exports.handleUpload = (req, res, next) => {
  // console.log(req.file);
  let ext = req.file.filename;
  ext = ext.split('.').pop();
  if (ext != 'png' && ext != 'jpeg' && ext != 'jpg') {
    res.json({ error: true, message: 'not correct ft' });
  } else {
    pathMapping.set(path.parse(req.file.filename).name, req.file.path);
    mimeMapping.set(path.parse(req.file.filename).name, req.file.mimetype);
    res.json({ mediaid: path.parse(req.file.filename).name });
  }
};

/**
 * Access previously stored media, returning a response with the correct MIME type.
 *
 * @returns the media.
 */
exports.handleAccess = (req, res, next) => {
  const mediaID = req.params.MEDIAID;
  let filePath = pathMapping.get(mediaID);
  res.header('Content-Type', mimeMapping.get(mediaID));
  res.sendFile(filePath, {}, function (err) {
    if (err) {
      console.log(err);
      res.json({ error: true, message: "couldn't send file" });
    } else {
      console.log(`${filePath} sent!`);
    }
  });
};
