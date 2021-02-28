const { apiURL } = require('../config.js')

const {
  addStoreTrackToUsers,
  addStoreArtistToUser,
  addStoreLabelToUser,
  removeArtistWatchesFromUser,
  removeLabelWatchesFromUser
} = require('./logic.js')

module.exports.tracksHandler = type => async (req, res, next) => {
  try {
    console.log('Start processing received tracks')

    let addedTracks = []
    for (const track of req.body) {
      const trackId = await addStoreTrackToUsers(req.headers['x-multi-store-player-store'], [req.user.id], track, type)
      addedTracks.push(`${apiURL}/tracks/${trackId}`)
    }

    res.status(201).send(addedTracks)
  } catch (e) {
    next(e)
  }
}

module.exports.artistsHandler = async ({ user, body, headers }, res, next) => {
  try {
    console.log('Start processing received artists')
    const storeUrl = headers['x-multi-store-player-store']

    await removeArtistWatchesFromUser(storeUrl, user)
    let addedArtists = []
    for (const artist of body) {
      const artistId = await addStoreArtistToUser(storeUrl, user, artist)
      addedArtists.push(`${apiURL}/artists/${artistId}`)
    }

    res.status(201).send(addedArtists)
  } catch (e) {
    next(e)
  }
}

module.exports.labelsHandler = async ({ user, body, headers }, res, next) => {
  try {
    console.log('Start processing received labels')
    const storeUrl = headers['x-multi-store-player-store']

    await removeLabelWatchesFromUser(storeUrl, user)
    let addedLabels = []
    for (const label of body) {
      const labelId = await addStoreLabelToUser(storeUrl, user, label)
      addedLabels.push(`${apiURL}/labels/${labelId}`)
    }

    res.status(201).send(addedLabels)
  } catch (e) {
    next(e)
  }
}
