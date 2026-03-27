const { getArtistTracks, getLabelTracks, getPlaylistTracks, storeName } = require('../../routes/stores/junodownload/logic')
const { scheduleEmail } = require('../../services/mailer')
const logger = require('fomoplayer_shared').logger(__filename)
const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg

const requiredTrackProperties = [
  'id',
  'title',
  'url',
  'artists',
  'duration_ms',
  'release',
  'label',
  'previews',
  'track_number',
  'store_details',
]

async function getArtistDetails() {
  const rows = await pg.queryRowsAsync(sql`
    SELECT store__artist_store_id AS "artistStoreId", store__artist_url AS url
    FROM store__artist
    NATURAL JOIN artist
    NATURAL JOIN store
    WHERE store_name = ${storeName}
    LIMIT 1
  `)
  if (rows.length > 0) return rows[0]
  return { url: 'https://www.junodownload.com/artists/Basstripper/', artistStoreId: null }
}

async function getLabelDetails() {
  const rows = await pg.queryRowsAsync(sql`
    SELECT store__label_store_id AS "labelStoreId", store__label_url AS url
    FROM store__label
    NATURAL JOIN label
    NATURAL JOIN store
    WHERE store_name = ${storeName}
    LIMIT 1
  `)
  if (rows.length > 0) return rows[0]
  return { url: 'https://www.junodownload.com/labels/DnB+Allstars/', labelStoreId: null }
}

module.exports = async () => {
  const artistDetails = await getArtistDetails()
  const labelDetails = await getLabelDetails()

  const genrePlaylistUrl = 'https://www.junodownload.com/drumandbass/'
  const detailsAndFunctions = [
    [artistDetails, getArtistTracks],
    [labelDetails, getLabelTracks],
    [{ playlistStoreId: genrePlaylistUrl, url: genrePlaylistUrl }, getPlaylistTracks],
  ]

  const combinedErrors = []
  for (const [details, fn] of detailsAndFunctions) {
    try {
      const generator = fn(details)
      let yieldedTracks = false
      for await (const { tracks, errors } of generator) {
        if (errors.length > 0) {
          logger.error(`Errors in fetching tracks for (${details.url}): ${JSON.stringify(errors)}`)
          combinedErrors.push(...errors)
        }
        if (tracks.length > 0) {
          yieldedTracks = true
          const missingTrackProperties = requiredTrackProperties.filter(
            (prop) => !Object.prototype.hasOwnProperty.call(tracks[0], prop) || tracks[0][prop] === null,
          )
          if (missingTrackProperties.length > 0) {
            combinedErrors.push(
              `Missing or null properties in fetched tracks for (${details.url}): ${missingTrackProperties.join(', ')}`,
            )
          }
        }
      }
      if (!yieldedTracks) {
        combinedErrors.push(`No tracks fetched for (${details.url})`)
      }
    } catch (e) {
      logger.error(`Juno Download integration test ${fn.name} failed: ${e.toString().substring(0, 200)}`)
      combinedErrors.push(e)
    }
  }

  if (combinedErrors.length > 0) {
    await scheduleEmail(
      process.env.ADMIN_EMAIL_SENDER,
      process.env.ADMIN_EMAIL_RECIPIENT,
      'URGENT! Juno Download integration test failed!',
      `Errors: ${JSON.stringify(combinedErrors)}`,
    )
    return { result: combinedErrors, success: false }
  }

  return { success: true }
}
