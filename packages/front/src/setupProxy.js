const { createProxyMiddleware } = require('http-proxy-middleware')
const config = require('fomoplayer_shared').config(process.env.NODE_ENV).config

module.exports = function (app) {
  if (process.env.NODE_ENV === 'development') {
    app.use(
      '/api',
      createProxyMiddleware({
        target: 'http://localhost:4003', // TODO: fix: config.API_URL,
        changeOrigin: true,
      }),
    )
  }
}
