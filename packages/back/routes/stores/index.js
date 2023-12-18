const router = require('express').Router()
const logger = require('fomoplayer_shared').logger(__filename)
const { getStoreDetails, modules } = require('./store-modules')

router.get('/', async (req, res) => {
  res.send(await getStoreDetails())
})

Object.entries(modules).forEach(([name, module]) => {
  logger.info(`Initiating routes for ${name}`)
  router.use(`/${name}`, module.router)
})

module.exports.router = router
