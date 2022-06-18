const { search } = require('./logic')
const router = require('express-promise-router')()

router.get('/search', ({ query: { q } }, res) => search(q).then(results => res.send(results)))

module.exports = router
