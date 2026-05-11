const fs = require('fs')
const path = require('path')

const SUPPORTED_BROWSERS = ['chrome', 'firefox', 'safari']

const MAGIC = {
  '.woff2': Buffer.from('wOF2', 'ascii'),
  '.woff': Buffer.from('wOFF', 'ascii'),
}

const parseArgs = (argv) => {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--browser') args.browser = argv[++i]
  }
  return args
}

const checkFile = (filePath) => {
  const ext = path.extname(filePath).toLowerCase()
  const expected = MAGIC[ext]
  if (!expected) return null
  const fd = fs.openSync(filePath, 'r')
  const head = Buffer.alloc(expected.length)
  fs.readSync(fd, head, 0, expected.length, 0)
  fs.closeSync(fd)
  if (!head.equals(expected)) {
    return `${filePath}: expected magic '${expected.toString('ascii')}' but read '${head.toString('ascii').replace(/[^\x20-\x7e]/g, '?')}' (${head.toString('hex')})`
  }
  return null
}

const main = () => {
  const { browser } = parseArgs(process.argv)
  if (!browser || !SUPPORTED_BROWSERS.includes(browser)) {
    console.error(`usage: node verify-font-assets.js --browser <${SUPPORTED_BROWSERS.join('|')}>`)
    process.exit(2)
  }
  const buildDir = path.join(__dirname, '..', 'build', browser)
  if (!fs.existsSync(buildDir)) {
    console.error(`verify-font-assets: build directory not found: ${buildDir}`)
    process.exit(2)
  }
  const entries = fs.readdirSync(buildDir)
  const fontFiles = entries.filter((f) => Object.keys(MAGIC).includes(path.extname(f).toLowerCase()))
  if (fontFiles.length === 0) {
    console.log(`verify-font-assets: no font files in ${buildDir} — nothing to check`)
    return
  }
  const errors = []
  for (const file of fontFiles) {
    const err = checkFile(path.join(buildDir, file))
    if (err) errors.push(err)
  }
  if (errors.length) {
    console.error('verify-font-assets: invalid font assets:')
    for (const e of errors) console.error('  ' + e)
    process.exit(1)
  }
  console.log(`verify-font-assets: ${fontFiles.length} font file(s) in build/${browser}/ have valid magic headers`)
}

main()
