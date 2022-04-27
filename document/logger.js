const winston = require('winston');

const logger = winston.createLogger({
  level: process.env['LOGGER_LEVEL'] || 'debug',
  silent: !!process.env['SILENCE_LOGS'] || false,
  format: winston.format.simple(),
  transports: [
    new winston.transports.Console()
  ]
});

module.exports = logger