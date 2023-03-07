const winston = require('winston')
const { combine, timestamp, printf, colorize, align } = winston.format
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
  format: combine(
    printf(
      ({ timestamp, moduleName, level, message, ...meta }) =>
        `${level} [${moduleName.replace(require.main.path, '')}]: ${message}, meta: ${JSON.stringify(meta)}`
    )
  ),
  transports
})

module.exports = function(name) {
  // set the default moduleName of the child
  return logger.child({ moduleName: name })
}
