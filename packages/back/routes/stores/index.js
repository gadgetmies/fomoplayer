const router = require('express').Router()
const logger = require('fomoplayer_shared').logger(__filename)

const { lstatSync, readdirSync } = require('fs')
const { join } = require('path')
const { getStores } = require('./logic')

const isDirectory = source => lstatSync(source).isDirectory()
const getDirectories = source =>
  readdirSync(source)
    .map(name => join(source, name))
    .filter(isDirectory)

const moduleEntries = getDirectories(__dirname).map(storeDir => {
  const storeName = storeDir.substring(storeDir.lastIndexOf('/') + 1)
  return [storeName, require(`${storeDir}/index.js`)]
})

moduleEntries.forEach(([name, module]) => {
  logger.info(`Initiating routes for ${name}`)
  router.use(`/${name}`, module.router)
})

router.get('/', async (req, res) => {
  res.send(await getStores())
})

const modules = Object.fromEntries(moduleEntries)

module.exports.router = router
module.exports.modules = modules
