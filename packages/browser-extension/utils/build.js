const webpack = require('webpack')
const config = require('../webpack.config')

delete config.chromeExtensionBoilerplate

webpack(config, function (err, stats) {
  if (err) {
    console.error(err.stack || err)
    if (err.details) console.error(err.details)
    process.exit(1)
  }

  console.log(stats.toString({ colors: true, modules: false, chunks: false, assets: false, errorDetails: true }))

  if (stats.hasErrors()) {
    process.exit(1)
  }
})
