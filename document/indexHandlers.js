const { Client } = require('@elastic/elasticsearch');

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

exports.deleteIndex = () => {
    client.indices.delete({index: 'documents' });
}

exports.createIndex = async () => {
    if (await client.indices.exists({index: 'documents'})) {
        console.log("Elasticsearch index documents already exists");
        return false;
    }
    return await client.indices.create({
    index: 'documents',
    settings: {
      analysis: {
        analyzer: {
          //TODO : test if this analyzer works
          my_analyzer: {
            tokenizer: 'standard', 
            filter: ['stop', 'stemmer'], // filters stop words and stemming
          },
        },
      },
    },
    body: {
      mappings: {
        properties: {
          id: {
            type: 'text',
          },
          name: {
            type: 'text',
            analyzer: 'simple',
          },
          text: {
            type: 'text',
            analyzer: 'my_analyzer',
          },
          suggest : {
            type: 'completion',
          },
        },
      },
    },
  });
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

// /index/search?q=...
exports.handleSearch = async (req, res) => {
  const searchText = req.query.q;
  client
    .search({
      index: 'documents',
      body: {
        query: {
          multi_match: { 
            query: searchText.trim(),
            fields: ['name', 'text'],
          }, 
        },
        highlight: {
          fields: {
            text: {}
          },
        },
      },
    })
    .then((response) => {
      let endpointResponse = [];
      const hits = response.hits.hits;
      let counter = 0;
      response.hits.hits.forEach(hit => {
        let {_source, highlight, ...params} = hit;
        endpointResponse.push({
            id: params._id, 
            name: _source.name, 
            snippet: highlight.text[0],
        });
      });
    })
    .catch((err) => {
      return res.status(500).json({ message: 'Error' });
    });
};

// /index/suggest?q=...
// TODO : figure out a way to get multiple autocomplete suggests (also do we really have to)
exports.handleSuggest = async (req, res) => {
  const suggestText = req.query.q;
  const response = await client.search({
      index: 'documents',
    body: {
      suggest: {
        gotsuggest: {
          prefix: suggestText,
          completion: {
            field: 'suggest',
          },
        },
      },
    },
  });
  let suggestedWords = response.suggest.gotsuggest[0].options[0];
  if(!suggestedWords) {
    res.json([]); //alternatively throw an error
  } else {
    res.json([suggestedWords.text]); 
  }
};
