const router = require('express-promise-router')()
const { search } = require('./logic.js')

router.get('/search', ({ query: { q } }, res) => search(q).then(results => res.send(results)))

module.exports = router
