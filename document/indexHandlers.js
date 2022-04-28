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

exports.deleteIndex = () => {
    client.indices.delete({index: 'documents' });
}

exports.createIndex = async () => {
    if (await client.indices.exists({index: 'documents'})) {
      logger.info("Elasticsearch index documents already exists");
      return false;
    }
    client.indices.create({
    index: 'documents',
    settings: {
      analysis: {
        analyzer: {
          //TODO : test if this analyzer works
            my_analyzer: {
            tokenizer: 'standard', 
            filter: ['stop', 'stemmer', 'lowercase'], // filters stop words and stemming
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

//returns a snippet string from highlight object, priority given to text
function pickSnippet(highlight) {
  if(highlight.text) {
    return highlight.text[0];
  } else if(highlight.name) {
    return highlight.name[0];
  } else {
    return ''; 
  }
}

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
            text: {},
            name: {}
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
            snippet: pickSnippet(highlight),
        });
      });
      logger.info(`endpointResponse: ${JSON.stringify(endpointResponse)}`) // ofc works
      res.json(endpointResponse)

    })
    .catch((err) => {
      return res.json({ error: true, message: `search failed, err=${err} ` });
    });
};

// /index/suggest?q=...
// TODO : figure out a way to get multiple autocomplete suggests (also do we really have to)
exports.handleSuggest = async (req, res) => {
  const suggestText = req.query.q;
  const response = await client.search({
    index: 'documents',
    body: {
      _source: false,
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
