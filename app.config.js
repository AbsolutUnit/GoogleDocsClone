const gatewayEnv = require('./gateway/env');
const documentEnv = require('./document/env');

module.exports = {
  apps: [{
    name: "gateway",
    script: "./gateway/gateway.js",
    env_production: gatewayEnv,
    instances: 1,
    autorestart: false,
    log_date_format: "YYYY-MM-DD HH:mm Z"
  },
  {
    name: "doc",
    script: "./document/server.js",
    env_production: documentEnv,
    increment_var: "PORT",
    instance_var: "INSTANCE_ID",
    instances: 4,
    autorestart: false,
    log_date_format: "YYYY-MM-DD HH:mm Z"
  }
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
