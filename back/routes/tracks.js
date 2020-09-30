const router = require('express').Router()
//const bodyParser = require('body-parser')
// router.use(bodyParser.json())

const { addStoreTrackToUser } = require('./logic.js')

module.exports = async (req, res, next) => {
  try {
    for (const track of req.body) {
      await addStoreTrackToUser(req.headers['x-multi-store-player-store'], req.user.id, track)
    }
    res.status(204).send()
  } catch (e) {
    next(e)
  }
}
