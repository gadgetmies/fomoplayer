const winston = require('winston')

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.printf(options => {
        // you can pass any custom variable in options by calling
        // logger.log({level: 'debug', message: 'hi', moduleName: 'my_module' })
        return `[${options.moduleName}] ${options.level}: ${options.message}$`
      })
    })
  ]
})

module.exports = function(name) {
  // set the default moduleName of the child
  return logger.child({ moduleName: name })
}
