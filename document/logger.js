const { format, loggers, transports } = require('winston')

loggers.add('my-logger', {
  level: process.env['LOGGER_LEVEL'] || 'debug',
  silent: !!process.env['SILENCE_LOGS'] || false,
  format: format.simple(),
  transports: [
    new transports.Console()
  ]
});

require('./server.js')
require('./docHandlers.js')
require('./indexHandlers.js')
require('./mediaHandlers.js')
