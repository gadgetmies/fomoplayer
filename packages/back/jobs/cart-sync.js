const pg = require('../db/pg')
const sql = require('sql-template-strings')
const { getCartDetails, addTracksToCart, removeTracksFromCart } = require('../routes/shared/cart')
const logger = require('../logger.js')(__filename)
const R = require('ramda')
const { getTracksForStoreIds, addStoreTracksToUsers } = require('../routes/shared/tracks')
const { spotifyTracksTransform } = require('multi_store_player_chrome_extension/src/js/transforms/spotify')
const { addTracks } = require('../test/lib/tracks')
const { storeUrl } = require('../routes/stores/spotify/logic')
const { getSpotifyTrackUris, getApiForUser } = require('../routes/shared/spotify')

module.exports.syncCarts = async () => {
  let errors = []

  try {
    const cartsToUpdate = await pg.queryRowsAsync(
      // language=PostgreSQL
      sql`--syncCarts
SELECT
    meta_account_user_id
  , JSON_AGG(JSON_BUILD_OBJECT('storeId', store_id, 'cartId', cart_id, 'cartStoreId', cart__store_cart_store_id,
                               'cartVersionId', cart__store_store_version_id)) AS cartdetails
FROM
    cart__store
        NATURAL JOIN cart
WHERE
      cart__store_updated < NOW() - INTERVAL '30 minutes'
  AND store_id = (SELECT store_id FROM store WHERE store_name = 'Spotify')
GROUP BY
    1
      `
    )

    for (const { userId, cartDetails } of cartsToUpdate) {
      const api = await getApiForUser(userId)
      for (const { cartId, cartStoreId, cartVersionId } of cartDetails) {
        try {
          const { tracks } = await getCartDetails(userId, cartId)
          const playlist = await api.getPlaylist(cartStoreId)

          if (cartVersionId === playlist.snapshot_id) {
            logger.info(`Playlist ${cartStoreId} has not changed in Spotify -> skipping`)
            continue
          }

          const storeTrackUris = playlist.tracks.items.map(({ track: { uri } }) => uri)
          const dbTrackUris = getSpotifyTrackUris(tracks)
          const diff = R.symmetricDifference(storeTrackUris, dbTrackUris)
          const [removed, added] = R.partition(u => dbTrackUris.includes(u), diff)

          const removedTracks = await getTracksForStoreIds('Spotify', removed)
          await removeTracksFromCart(userId, cartId, removedTracks)

          const newTrackInCart = spotifyTracksTransform(
            playlist.tracks.items.filter(({ track: { uri } }) => added.includes(uri))
          )

          const addedTracks = await addStoreTracksToUsers(storeUrl, newTrackInCart, [userId])
          await addTracksToCart(userId, cartId, addedTracks)
        } catch (e) {
          logger.error(`Updating cart ${cartId} to match playlist ${cartStoreId} failed`, e)
          errors.push(e.toString())
        }
      }
    }
  } catch (e) {
    errors.push('Failed fetching cart details for cart synchronization')
  }

  if (errors.length === 0) {
    return { success: true }
  } else {
    return { success: false, result: errors }
  }
}
