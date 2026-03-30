const resolveServiceURL = require('./resolveServiceURL')
module.exports = (nodeEnv) => {
  const config = require(`./config.${nodeEnv || 'development'}.js`)

  return {
    resolveServiceURL,
    config: {
      ...config,
      RAW_FRONTEND_URL: config.FRONTEND_URL,
      RAW_API_URL: config.API_URL,
      FRONTEND_PORT: config.FRONTEND_PORT,
      FRONTEND_URL: resolveServiceURL(config.FRONTEND_URL, config.IP, config.FRONTEND_PORT),
      API_URL: resolveServiceURL(config.API_URL, config.IP, config.API_PORT, '/api'),
    },
  }
}
