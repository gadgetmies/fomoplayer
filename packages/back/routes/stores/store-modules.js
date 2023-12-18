const { lstatSync, readdirSync } = require('fs')
const { join } = require('path')
const isDirectory = source => lstatSync(source).isDirectory()

const getDirectories = source =>
  readdirSync(source)
    .map(name => join(source, name))
    .filter(isDirectory)

const moduleEntries = getDirectories(__dirname).map(storeDir => {
  const storeName = storeDir.substring(storeDir.lastIndexOf('/') + 1)
  return [storeName, require(`${storeDir}/index.js`)]
})

module.exports.modules = Object.fromEntries(moduleEntries)
module.exports.getStoreDetails = require('./db').queryStores
