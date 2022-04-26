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

exports.createIndex = () => {
    client.indices.create({
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
    script: {
      doc: {
        //TODO: what is the difference between this and script
        text: text,
      },
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
          match: { name: searchText.trim() },
        },
        result_fields : {
          title: {
            snippet: {
              size: 20, // readjustable (most likely good practice to calc based off size of searchText)
              fallback: true
            }
          },
          description: {
            raw: {
              size: 200
            },
            snippet: {
              size: 100
            }
          }
        }
      },
    })
    .then((response) => {
      //res.json(response);
      //res.end();
      //return;
      let endpointResponse = [];
      hits = response.hits.hits;
      let counter = 0;
      for (const hit of hits) {
        if (counter >= 10) break;
        //TODO: snippet does not exist at this point, just placeholder
        endpointResponse.push( {
          hit.hit._source.id,
          hit.hit._source.name,
          hit.hit._source.snippet
          //hit
	    });
        counter++;
      }
      return res.json(endpointResponse);
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
    index: 'products',
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
  res.json([response.suggest.gotsuggest[0].options[0].text,]);
};
