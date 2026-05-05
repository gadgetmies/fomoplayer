// Multi-target webpack watch driver for the browser extension.
//
// Reads BROWSERS (comma-separated, defaults to "chrome") and runs a single
// webpack MultiCompiler in watch mode against each selected target's
// build/<browser>/ output directory. Each rebuild's stats summary is
// prefixed with `[<browser>] ` so the operator can read multi-target
// output. Safari is rejected at startup — loading an unpacked Safari Web
// Extension needs xcrun + Xcode rebuild + re-sign + re-install, which a
// Node watcher cannot drive.
//
// Operator still reloads the extension manually from the browser's
// extensions page after each rebuild — there is no auto-reload here.

const path = require('path')
const webpack = require('webpack')

const SUPPORTED = ['chrome', 'firefox']

const parseBrowsers = (raw) => {
  const value = (raw || '').trim()
  if (value.length === 0) return ['chrome']
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

const browsers = parseBrowsers(process.env.BROWSERS)
const unsupported = browsers.filter((b) => !SUPPORTED.includes(b))
if (unsupported.length > 0) {
  const safariEntries = unsupported.filter((b) => b === 'safari')
  const otherEntries = unsupported.filter((b) => b !== 'safari')
  if (safariEntries.length > 0) {
    console.error(
      `Safari is not supported in watch mode: loading an unpacked Safari Web Extension requires xcrun safari-web-extension-converter + an Xcode rebuild that this script cannot drive. Use 'yarn build:safari' and the Xcode flow instead. See README.md "Loading the extension during development".`,
    )
  }
  if (otherEntries.length > 0) {
    console.error(
      `Unsupported BROWSERS entries: ${otherEntries.join(', ')}. Expected one or more of: ${SUPPORTED.join(', ')}.`,
    )
  }
  process.exit(1)
}

process.env.NODE_ENV = process.env.NODE_ENV || 'development'

const configPath = require.resolve('../webpack.config.js')

const configs = browsers.map((browser) => {
  process.env.BROWSER = browser
  delete require.cache[configPath]
  const cfg = require('../webpack.config.js')
  delete cfg.chromeExtensionBoilerplate
  cfg.name = browser
  return cfg
})

const compiler = webpack(configs)

const prefixLines = (text, prefix) =>
  text
    .split('\n')
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join('\n')

const printStats = (stats) => {
  const children = stats.stats || [stats]
  for (const child of children) {
    const name = child.compilation?.name || 'unknown'
    const summary = child.toString({
      colors: true,
      modules: false,
      chunks: false,
      assets: false,
      errorDetails: true,
    })
    process.stdout.write(prefixLines(summary, `[${name}] `) + '\n')
  }
}

console.log(`Watching: ${browsers.join(', ')} (NODE_ENV=${process.env.NODE_ENV})`)

const watching = compiler.watch({}, (err, stats) => {
  if (err) {
    console.error(err.stack || err)
    if (err.details) console.error(err.details)
    return
  }
  printStats(stats)
})

const shutdown = () => {
  console.log('\nClosing watcher…')
  watching.close((closeErr) => {
    if (closeErr) {
      console.error(closeErr.stack || closeErr)
      process.exit(1)
    }
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
