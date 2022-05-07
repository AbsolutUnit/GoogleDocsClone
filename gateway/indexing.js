const { Client } = require('@elastic/elasticsearch');
const { logger } = require('./logger')

const client = new Client({
  node: process.env["ELASTICSEARCH_URI"],
});
logger.warn(`Here's the URI ${process.env["ELASTICSEARCH_URI"]}`);

const prevSearch = {};
const prevSuggest = {};

exports.createIndex = async () => {
  logger.warn(`The current client is ${JSON.stringify(client)}`);
  if (await client.indices.exists({ index: 'documents' })) {
    logger.warn("Elasticsearch index documents already exists");
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
    return highlight.text.join('...');
  } else if (highlight.name) {
    return highlight.name.join('...');
  } else {
    return '';
  }
}

// /index/search?q=...
exports.handleIndexSearch = async (req, res) => {
  const searchText = req.query.q;
  if(prevSearch[searchText] !== undefined) {
    res.json(prevSearch[searchText]);
    return;
  }
  client
    .search({
      index: 'documents',
      body: {
        query: {
          simple_query_string: { // phrase matching
            query: "\""+searchText.trim()+"\"",
            fields: ['name', 'text'],
            default_operator: 'and',
          },
          //multi_match: { // individual word matching
          //  query: searchText.trim(),
          //  fields: ['name', 'text'],
          //},
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
          docid: params._id,
          name: _source.name,
          snippet: pickSnippet(highlight),
        });
      });
      logger.info(`endpointResponse: ${JSON.stringify(endpointResponse)}`) // ofc works
      prevSearch[searchText] = endpointResponse;
      res.json(endpointResponse)
    })
    .catch((err) => {
      res.json({ error: true, message: `search failed, err=${err} ` });
    });
};

// /index/suggest?q=...
// TODO : figure out a way to get multiple autocomplete suggests (also do we really have to)
exports.handleIndexSuggest = async (req, res) => {
  const suggestText = req.query.q;
  if(prevSuggest[suggestText] !== undefined) {
    res.json(prevSuggest[suggestText]);
    return;
  }
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
  let options = response.suggest.gotsuggest[0].options;
  let suggestedWords = [];
  for (option of options) {
    suggestedWords.push(option.text)
  }
  endpointResponse = Array.from(new Set(suggestedWords));
  prevSuggest[suggestText] = endpointResponse;
  res.json(endpointResponse);
};
