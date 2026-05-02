const nodeEnv = process.env.NODE_ENV || 'development'
const sharedConfig = require('fomoplayer_shared/config')(nodeEnv).config

// Per repo CLAUDE.md: deployment URLs must come from the environment. The
// extension bakes its backend URL into the bundle at build time, so this is
// a hard-fail rather than a silent fallback to a literal.
const defaultAppUrl = sharedConfig.RAW_FRONTEND_URL
if (!defaultAppUrl) {
  throw new Error(
    'FRONTEND_URL is required to build the extension. ' +
      'Set it (or REACT_APP_FRONTEND_URL) in the build environment.',
  )
}
const apiUrl = sharedConfig.RAW_API_URL || `${defaultAppUrl}/api`

module.exports = {
  PLAYER_API_URL: JSON.stringify(apiUrl),
  PLAYER_UI_URL: JSON.stringify(defaultAppUrl),
  DEFAULT_APP_URL: JSON.stringify(defaultAppUrl),
  PORT: process.env.PORT,
  NODE_ENV: nodeEnv,
  EXTENSION_KEY: process.env.EXTENSION_KEY,
}
