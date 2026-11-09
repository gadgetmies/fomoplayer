const { createProxyMiddleware } = require('http-proxy-middleware')
const config = require('fomoplayer_shared').config(process.env.NODE_ENV).config

module.exports = function (app) {
  if (process.env.NODE_ENV === 'development') {
    // Mount without a path: app.use('/api', ...) makes Express strip /api from req.url before
    // the proxy sees it, and the backend serves its routes under /api.
    app.use(
      createProxyMiddleware({
        pathFilter: '/api',
        target: 'http://localhost:4003', // TODO: fix: config.API_URL,
        changeOrigin: true,
      }),
    )
  }
}
