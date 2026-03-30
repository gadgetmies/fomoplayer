const nodeEnv = process.env.NODE_ENV || 'development'
const sharedConfig = require('fomoplayer_shared/config')(nodeEnv).config

const defaultAppUrl = sharedConfig.FRONTEND_URL || 'https://fomoplayer.com'

module.exports = {
  PLAYER_API_URL: JSON.stringify(sharedConfig.API_URL),
  PLAYER_UI_URL: JSON.stringify(defaultAppUrl),
  DEFAULT_APP_URL: JSON.stringify(defaultAppUrl),
  PORT: process.env.PORT,
  NODE_ENV: nodeEnv,
  EXTENSION_KEY: process.env.EXTENSION_KEY,
  GOOGLE_OIDC_CLIENT_ID: process.env.GOOGLE_OIDC_CLIENT_ID,
}
