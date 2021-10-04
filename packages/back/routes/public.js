const bodyParser = require('body-parser')
const router = require('express-promise-router')()

router.use(bodyParser.json())

const { getCartDetails } = require('./logic.js')
router.get('/carts/:uuid', async ({ params: { uuid } }, res) => {
  const cart = await getCartDetails(uuid)
  if (cart === null) {
    return res.status(404).send()
  }
  res.send(cart)
})

module.exports = router
