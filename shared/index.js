const resolveServiceURL = require('./resolveServiceURL.js')

module.exports = (nodeEnv) => {
  const config = require(`./config.${nodeEnv || 'development'}.js`)

  return {
    resolveServiceURL,
    config: {
      ...config,
      FRONTEND_PORT: config.FRONTEND_PORT,
      FRONTEND_URL: resolveServiceURL(config.FRONTEND_URL, config.INTERFACE, config.FRONTEND_PORT),
      API_URL: resolveServiceURL(config.API_URL, config.INTERFACE, config.API_PORT)
    }
  }
}
