const gatewayEnv = require('./gateway/env');
const documentEnv = require('./document/env');

module.exports = {
  apps: [{
    name: "gateway0",
    script: "./gateway/gateway.js",
    env: { ...gatewayEnv, PORT: 8080 },
    autorestart: false,
    log_date_format: "YYYY-MM-DD HH:mm Z"
  },
  
  {
    name: "gateway1",
    script: "./gateway/gateway.js",
    env: { ...gatewayEnv, PORT: 8081 },
    autorestart: false,
    log_date_format: "YYYY-MM-DD HH:mm Z",
  },
  /*
  {
    name: "gateway2",
    script: "./gateway/gateway.js",
    env: { ...gatewayEnv, PORT: 8082 },
    autorestart: false,
    log_date_format: "YYYY-MM-DD HH:mm Z",
  },
  {
    name: "gateway3",
    script: "./gateway/gateway.js",
    env: { ...gatewayEnv, PORT: 8083 },
    autorestart: false,
    log_date_format: "YYYY-MM-DD HH:mm Z",
  },
  */
  {
    name: "doc0",
    script: "./document/server.js",
    env: { ...documentEnv, PORT: 8080 }, // PORT must come after spread in order to update
    autorestart: false,
    log_date_format: "YYYY-MM-DD HH:mm Z"
  },
  {
    name: "doc1",
    script: "./document/server.js",
    env: { ...documentEnv, PORT: 8081 },
    autorestart: false,
    log_date_format: "YYYY-MM-DD HH:mm Z"
  },
  {
    name: "doc2",
    script: "./document/server.js",
    env: { ...documentEnv, PORT: 8082 },
    autorestart: false,
    log_date_format: "YYYY-MM-DD HH:mm Z"
  },
  {
    name: "doc3",
    script: "./document/server.js",
    env: { ...documentEnv, PORT: 8083 },
    autorestart: false,
    log_date_format: "YYYY-MM-DD HH:mm Z"
  },
  {
    name: "doc4",
    script: "./document/server.js",
    env: { ...documentEnv, PORT: 8084 },
    autorestart: false,
    log_date_format: "YYYY-MM-DD HH:mm Z"
  },
  ]
}

/* by default winston uses these: lowest most important
{
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
}
*/

