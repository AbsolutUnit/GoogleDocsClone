const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('@elastic/elasticsearch');
const app = express();

const indexHandler = require('./indexHandler');

app.use(bodyParser.json());

const client = new Client({
  node: 'http://localhost:9200',
});

app.post('/products', (req, res) => {
  const { id, name, price, description } = req.body;
  let suggest = description.trim().split(' ');
  const lorem = `Far far away, behind the word mountains, far from the countries Vokalia and Consonantia, there live the blind texts. Separated they live in Bookmarksgrove right at the coast of the Semantics, a large language ocean. A small river named Duden flows by their place and supplies it with the necessary regelialia. It is a paradisematic country, in which roasted parts of sentences fly into your mouth. Even the all-powerful Pointing has no control about the blind texts it is an almost unorthographic life One day however a small line of blind text by the name of Lorem Ipsum decided to leave for the far World of Grammar. The Big Oxmox advised her not to do so, because there were thousands of bad Commas, wild Question Marks and devious Semikoli, but the Little Blind Text didn’t listen. She packed her seven versalia, put her initial into the belt and made herself on the way. When she reached the first hills of the Italic Mountains, she had a last view back on the skyline of her hometown Bookmarksgrove, the headline of Alphabet Village and the subline of her own road, the Line Lane. Pityful a rethoric question ran over her cheek, then`;
  suggest = lorem.trim().split(' ');
  client
    .index({
      index: 'products',
      id: '1',
      body: {
        id,
        name,
        price,
        description,
        suggest,
      },
    })
    .then((response) => {
      return res.json({ message: 'Indexing successful' });
    })
    .catch((err) => {
      return res.status(500).json({ message: err });
    });
});

app.get('/products/', (req, res) => {
  const searchText = req.query.q;
  client
    .search({
      index: 'products',
      body: {
        query: {
          match: { name: searchText.trim() },
        },
      },
    })
    .then((response) => {
      return res.json(response);
    })
    .catch((err) => {
      return res.status(500).json({ message: 'Error' });
    });
});

app.get('/suggest', async (req, res) => {
  const suggestText = req.query.q;
  const response = await client.search({
    index: 'products',
    body: {
      //query: { match: { id: '1' } },
      suggest: {
        // prefix: {
        gotsuggest: {
          prefix: suggestText,
          completion: {
            field: 'suggest',
          },
        },
      },
    },
  });
  res.json(response);
});

app.listen(process.env.PORT || 3000, () => {
  console.log('connected');
  client.indices.delete({ index: 'products' });
  client.indices.create({
    index: 'products',
    body: {
      mappings: {
        properties: {
          id: {
            type: 'text',
          },
          name: {
            type: 'text',
            analyzer: 'simple',
            search_analyzer: 'simple',
          },
          price: {
            type: 'text',
            analyzer: 'simple',
            search_analyzer: 'simple',
          },
          description: {
            type: 'text',
            analyzer: 'simple',
            search_analyzer: 'simple',
          },
          suggest: {
            type: 'completion',
          },
        },
      },
    },
  });
});
