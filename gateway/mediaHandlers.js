const multer = require('multer');
const path = require('path');
const { logger } = require('./logger')


//THESE ARE NOT PERSISTENT
let pathMapping = new Map();
let mimeMapping = new Map();

const storage = multer.diskStorage({
  destination: require.main?.path + "/media/uploads/",
  filename: (_, file, cb) => {
    let mediaID = parseInt(Math.random() * 1000000000).toString();
    cb(null, mediaID + path.extname(file.originalname));
  },
});

exports.handleMediaUpload = multer({ storage });

/**
 * Upload a media file to the server, so that it can be accessed later.
 *
 * @param req.file the file to upload
 * @return req.json: { mediaId }
 */
exports.handleMediaUploadNext = (req, res) => {
  let ext = req.file.filename.split('.').pop();
  logger.info(`File for Media: ${req.file !== null}`);
  if (ext != 'png' && ext != 'jpeg' && ext != 'jpg' && ext != 'gif') {
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
exports.handleMediaAccess = (req, res, next) => {
  const mediaID = req.params.MEDIAID;
  let filePath = pathMapping.get(mediaID);
  res.header('Content-Type', mimeMapping.get(mediaID));
  res.sendFile(filePath, {}, function (err) {
    if (err) {
      logger.info(err);
      res.json({ error: true, message: "couldn't send file" });
    } else {
      logger.info(`${filePath} sent!`);
    }
  });
};
