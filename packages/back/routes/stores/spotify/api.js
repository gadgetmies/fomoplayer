const router = require('express').Router()
const { search } = require('./logic.js')

router.get('/search', ({ query: { q } }, res) => search(q).then(results => res.send(results)))

module.exports = router
