const WebpackDevServer = require('webpack-dev-server')
const webpack = require('webpack')
const webPackConfig = require('../webpack.config.js')
const config = require('./config.js')
const path = require('path')

const options = webPackConfig.chromeExtensionBoilerplate || {}
const excludeEntriesToHotReload = options.notHotReload || []
const port = config.PORT

for (const entryName in webPackConfig.entry) {
  if (excludeEntriesToHotReload.indexOf(entryName) === -1) {
    webPackConfig.entry[entryName] = [
      'webpack-dev-server/client?http://localhost:' + port,
      'webpack/hot/dev-server'
    ].concat(webPackConfig.entry[entryName])
  }
}

webPackConfig.plugins = [new webpack.HotModuleReplacementPlugin()].concat(webPackConfig.plugins || [])

delete webPackConfig.chromeExtensionBoilerplate

const compiler = webpack(webPackConfig)

const server = new WebpackDevServer(compiler, {
  hot: true,
  contentBase: path.join(__dirname, '../build'),
  sockPort: port,
  headers: {
    'Access-Control-Allow-Origin': '*'
  },
  disableHostCheck: true
})

server.listen(port)
