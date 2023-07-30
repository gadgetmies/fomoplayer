const router = require('express-promise-router')()
const { search } = require('./logic.js')
const { enableCartSync, removeCartSync } = require('./logic')

router.get('/search', ({ query: { q } }, res) => search(q).then(results => res.send(results)))

module.exports = router
