const { Client } = require('@elastic/elasticsearch');
const { logger } = require('./logger')

const client = new Client({
  node: 'http://localhost:9200',
});

/*
  documents index properties:
   - id: document id
   - name : name of the document
   - text : plain text of document

  TODO:
   - when starting service, define field types of documents index (createIndex)
   - when creating document in sharedb, add ES document to documents index (addDocument)
   - figure out what elastic search updates index on every second?
   - update ES document on some interval (updateDocument)
   - get snippets working for handleSearch
   - put 'documents' index into an env variable 
   - add suggest field onto index

  packages: 
   - https://www.npmjs.com/package/quill-delta-to-plaintext
 */

// Kelvin: where is this used???
exports.analyzeText = async (text) => {
  const response = await client.indices.analyze({
      index: 'documents',
      body: {
        analyzer: 'my_analyzer',
        text: text,
      }
  });
  return response;
};

exports.addDocument = (id, name, text) => {
  client
    .index({
      index: 'documents',
      id: id,
      body: {
        name,
        text, 
        suggest: text.trim().split(' '),
      },
    })
    .then((response) => {
      return JSON.stringify({ message: 'Indexing successful' });
    })
    .catch((err) => {
      return JSON.stringify({ message: err });
    });
};

exports.updateDocument = async (text, id) => {
  await client.update({
    index: 'documents',
    id: id,
    doc: {
      //TODO: what is the difference between this and script
      text: text,
      suggest: text.trim().split(' '),
    },
  });
};
