const { createProxyMiddleware } = require('http-proxy-middleware')
const resolveServiceURL = require('./shared/resolveServiceURL.js')

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: resolveServiceURL(process.env.REACT_APP_API_URL, process.env.REACT_APP_INTERFACE, process.env.REACT_APP_API_PORT),
      changeOrigin: true
    })
  )
}
