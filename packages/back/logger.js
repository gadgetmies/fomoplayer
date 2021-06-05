const winston = require('winston')
const { combine, printf } = winston.format

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || 'info',
      format: combine(
        printf(
          ({ timestamp, moduleName, level, message, ...meta }) =>
            `${level} [${moduleName.replace(require.main.path, '')}]: ${message}, meta: ${JSON.stringify(meta)}`
        )
      )
    })
  ]
})

module.exports = function(name) {
  // set the default moduleName of the child
  return logger.child({ moduleName: name })
}
