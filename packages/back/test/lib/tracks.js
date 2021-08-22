const { insertSource } = require('../../jobs/watches/shared/db')
const { storeUrl: beatportUrl } = require('../../routes/stores/beatport/logic.js')
const { addStoreTracksToUser } = require('../../routes/users/logic.js')
const {
  beatportTracksTransform,
  beatportLibraryTransform
} = require('../../../chrome-extension/src/js/transforms/beatport.js')

const userId = 1

const addTracks = (module.exports.addTracks = async (tracks, type = 'new') => {
  const sourceId = await insertSource({
    operation: 'tracksHandlerTest',
    type: 'new',
    storeUrl: beatportUrl
  })
  await addStoreTracksToUser(beatportUrl, type, tracks, userId, sourceId)
})

module.exports.addNewBeatportTracksToDb = async (tracks) => {
  await addTracks(beatportTracksTransform(tracks))
}

module.exports.addPurchasedBeatportTracksToDb = async (tracks) => {
  await addTracks(beatportLibraryTransform(tracks), 'purchased')
}
