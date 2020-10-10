const nodeEnv = process.env.NODE_ENV || 'development'
const config = require(`./config.${nodeEnv}.js`)
const sharedConfig = require('shared')(nodeEnv).config

module.exports = {
  PLAYER_API_URL: JSON.stringify(sharedConfig.API_URL),
  PLAYER_UI_URL: JSON.stringify(sharedConfig.FRONTEND_URL),
  PLAYER_UI_MATCHER: new RegExp(`^${sharedConfig.FRONTEND_URL}`),
  PORT: process.env.PORT,
  NODE_ENV: nodeEnv,
  ...config
}
