const router = require('express').Router()
const { apiURL } = require('../config.js')
//const bodyParser = require('body-parser')
// router.use(bodyParser.json())

const { addStoreTrackToUser } = require('./logic.js')

module.exports = async (req, res, next) => {
  try {
    const addedTracks = await Promise.all(req.body.map(async track => {
        const trackId = await addStoreTrackToUser(req.headers['x-multi-store-player-store'], req.user.id, track)
        console.log(trackId)
        return `${apiURL}/tracks/${trackId}`
      })
    )
    res.status(201).send(addedTracks)
  } catch (e) {
    next(e)
  }
}
