module.exports = {
    apps : [{
      name   : "auth",
      script : "./auth/auth.js",
      env_production: {
        SILENCE_LOGS: '', // empty string enables logging
        LOGGER_LEVEL: 'info',
        MONGO_URI: 'mongodb://127.0.0.1:27017',
        SMTP_HOST: 'backyardigans.cse356.compas.cs.stonybrook.edu',
        SMTP_USER: 'root',
        SMTP_PASS: 'cse356!!!312asdacm',
        SMTP_NAME: 'backyardigans',
        CSE_356_ID: '61f9d48d3e92a433bf4fc893',
        DOCUMENT_URL: 'http://localhost:8081',
        DOC0_HOST: 'http://localhost:8081',
        DOC1_HOST: 'http://localhost:8083',
      },
      autorestart: false,
      log_date_format: "YYYY-MM-DD HH:mm Z"
    },
    {
      name: 'doc0',
      script: './document/server.js',
      env_production: {
        SILENCE_LOGS: '',
        LOGGER_LEVEL: 'info',
        CSE_356_ID: '61f9d48d3e92a433bf4fc893',
        MONGO_URI: 'mongodb://localhost:27017',
        AUTH_HOST: 'localhost:8080',
        DOC_PORT: '8081',
        SHAREDB_PORT: '8082'
      },
      autorestart: false,
      log_date_format: "YYYY-MM-DD HH:mm Z"
    },
    // {
    //   name: 'doc1',
    //   script: './document/server.js',
    //   env_production: {
    //     SILENCE_LOGS: '',
    //     LOGGER_LEVEL: 'info',
    //     CSE_356_ID: '61f9d48d3e92a433bf4fc893',
    //     MONGO_URI: 'mongodb://localhost:27017',
    //     AUTH_HOST: 'http://localhost:8080',
    //     DOC_PORT: '8083',
    //     SHAREDB_PORT: '8084'
    //   },
    //   watch: true,
    //   autorestart: false,
    //   log_date_format: "YYYY-MM-DD HH:mm Z"
    // }
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
