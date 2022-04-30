const { Client } = require('@elastic/elasticsearch');
const { logger } = require('./logger')

const client = new Client({
  node: process.env["ELASTICSEARCH_URI"],
});

exports.createIndex = async () => {
  if (await client.indices.exists({ index: 'documents' })) {
    logger.info("Elasticsearch index documents already exists");
    return false;
  }
  await client.indices.create({
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
          suggest: {
            type: 'completion',
          },
        },
      },
    },
  });
};

exports.handleDeleteIndex = (_, res) => {
  client.indices.delete({ index: 'documents' });
  res.write('index deleted');
  res.end();
  logger.info('called deleteIndex')
}

//returns a snippet string from highlight object, priority given to text
function pickSnippet(highlight) {
  if (highlight.text) {
    return highlight.text[0];
  } else if (highlight.name) {
    return higlight.name[0];
  } else {
    return '';
  }
}

// /index/search?q=...
exports.handleIndexSearch = async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 2000));
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
        let { _source, highlight, ...params } = hit;
        endpointResponse.push({
          id: params._id,
          name: _source.name,
          snippet: pickSnippet(highlight),
        });
      });
      logger.info(`endpointResponse: ${JSON.stringify(endpointResponse)}`) // ofc works
      return res.json(endpointResponse)
    })
    .catch((err) => {
      return res.json({ error: true, message: `search failed, err=${err} ` });
    });
};

// /index/suggest?q=...
// TODO : figure out a way to get multiple autocomplete suggests (also do we really have to)
exports.handleIndexSuggest = async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 2000));
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
  if (!suggestedWords) {
    res.json([]); //alternatively thow an error
  } else {
    res.json([suggestedWords.text]);
  }
};