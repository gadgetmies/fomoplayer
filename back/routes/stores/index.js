const router = require('express').Router()

const { lstatSync, readdirSync } = require('fs')
const { join } = require('path')

const isDirectory = source => lstatSync(source).isDirectory()
const getDirectories = source =>
  readdirSync(source).map(name => join(source, name)).filter(isDirectory)

getDirectories(__dirname)
  .map(storeDir => {
    const storeName = storeDir.substring(storeDir.lastIndexOf('/') + 1)
    console.log(`Initiating routes for ${storeName}`)
    router.use(`/${storeName}`, require(`${storeDir}/index.js`))
  })

module.exports = router
