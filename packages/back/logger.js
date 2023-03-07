const winston = require('winston')
const TelegramLogger = require('winston-telegram')

let transports = [new winston.transports.Console()]
if (process.env.TELEGRAM_BOT_TOKEN) {
  transports.push(
    new TelegramLogger({
      name: 'error-channel',
      token: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_BOT_CHAT_ID,
      level: 'error',
      unique: true
    })
  )
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports
})

module.exports = function(name) {
  // set the default moduleName of the child
  return logger.child({ moduleName: name })
}
