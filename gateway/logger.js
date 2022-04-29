const { format, loggers, transports } = require('winston')

loggers.add('my-logger', {
  level: process.env['LOGGER_LEVEL'] || 'debug',
  silent: !!process.env['SILENCE_LOGS'] || false,
  format: format.simple(),
  transports: [
    new transports.Console()
  ]
});

const winston = require('winston');

const logger = winston.createLogger({
  level: process.env['LOGGER_LEVEL'] || 'debug',
  silent: !!process.env['SILENCE_LOGS'] || false,
  format: winston.format.simple(),
  transports: [
    new winston.transports.Console()
  ]
});

logger.info('set up logger')
module.exports = { logger }
