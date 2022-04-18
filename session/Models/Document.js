const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const docSchema = new Schema({
  docName: {
    type: String,
    required: true,
  },
  docID: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model("Documentname", docSchema);
