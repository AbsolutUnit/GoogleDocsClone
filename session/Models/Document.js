const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const docSchema = new Schema({
  docName: {
    type: String,
    required: true,
  },
  docId: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model('Doc', docSchema);
