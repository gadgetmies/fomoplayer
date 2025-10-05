const resolveServiceURL = require('./resolveServiceURL.js')

module.exports = {
  config: require('./config.js'),
  interceptors: {
    bandcamp: require('./interceptors/bandcampInterceptor.js'),
    beatport: require('./interceptors/beatportInterceptor.js'),
    googleOAuth: require('./interceptors/googleOAuthInterceptor.js'),
    spotify: require('./interceptors/spotifyInterceptor.js'),
  },
  db: {
    pg: require('./db/pg.js'),
  },
  logger: require('./logger.js'),
  resolveServiceURL: require('./resolveServiceURL.js'),
}
