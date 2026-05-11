const { spawnSync } = require('child_process')
const path = require('path')
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

  const browser = process.env.BROWSER || 'chrome'
  const verifier = path.join(__dirname, 'verify-font-assets.js')
  const result = spawnSync(process.execPath, [verifier, '--browser', browser], { stdio: 'inherit' })
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
})
