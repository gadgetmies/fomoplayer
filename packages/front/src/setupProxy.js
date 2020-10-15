const { createProxyMiddleware } = require('http-proxy-middleware')
const { resolveServiceURL } = require('multi-store-player-shared-config')(process.env.NODE_ENV)

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: resolveServiceURL(process.env.REACT_APP_API_URL, process.env.REACT_APP_INTERFACE, process.env.REACT_APP_API_PORT),
      changeOrigin: true
    })
  )
}
