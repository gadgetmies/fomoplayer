const { getArtistTracks, getLabelTracks, getPlaylistTracks, storeName } = require('../../routes/stores/bandcamp/logic')
const { scheduleEmail } = require('../../services/mailer')
const logger = require('../../logger')(__filename)
const sql = require('sql-template-strings')
const pg = require('../../db/pg')

const requiredTrackProperties = [
  'id',
  'title',
  'version',
  'artists',
  'released',
  'published',
  'duration_ms',
  'release',
  'label',
  'previews',
  'store_details'
]

async function getArtistDetails() {
  const [details] = pg.queryRowsAsync(sql`
    -- Bandcamp integration test job get artist store id
    SELECT store__artist_store_id AS "artistStoreId", store__artist_url AS url
    FROM
      store__artist
      NATURAL JOIN artist
      NATURAL JOIN store
    WHERE artist.name = 'Noisia'
      AND store_name = ${storeName}
  `)
  return details
}

async function getLabelDetails() {
  const [details] = pg.queryRowsAsync(sql`
    -- Bandcamp integration test job get artist store id
    SELECT store__label_store_id AS "labelStoreId", store__label_url AS url
    FROM
      store__label
      NATURAL JOIN label
      NATURAL JOIN store
    WHERE label.name = 'VISION'
      AND store_name = ${storeName}
  `)
  return details
}

module.exports = async () => {
  const artistDetails = await getArtistDetails()
  const labelDetails = await getLabelDetails()

  const drumAndBassPlaylist = 'https://bandcamp.com/discover/electronic?tags=drum-bass'
  const detailsAndFunctions = [
    [artistDetails, getArtistTracks],
    [labelDetails, getLabelTracks],
    [{ playlistStoreId: drumAndBassPlaylist, url: drumAndBassPlaylist }, getPlaylistTracks]
  ]

  let combinedErrors = []
  for (const [details, fn] of detailsAndFunctions) {
    try {
      const generator = fn(details)
      for await (const { tracks, errors } of generator) {
        if (errors.length > 0) {
          logger.error(`Errors in fetching tracks for (${details.url}): ${JSON.stringify(errors)}`)
          combinedErrors.concat(errors)
        }

        if (tracks.length === 0) {
          const error = `No tracks fetched for (${details.url})`
          logger.error(error)
          combinedErrors.push(error)
        }

        const missingTrackProperties = requiredTrackProperties.filter(
          prop => tracks[0].hasOwnProperty(prop) && tracks[0][prop] !== null
        )

        if (missingTrackProperties.length !== 0) {
          const error = `Missing properties in fetched tracks for (${details.url}): ${missingTrackProperties.join(
            ', '
          )}`
          logger.error(error)
          combinedErrors.push(error)
        }
      }
    } catch (e) {
      logger.error(`Bandcamp integration test ${fn.name} failed: ${e.toString().substring(0, 100)}`)
      combinedErrors.push(e)
    }
  }

  if (combinedErrors.length !== 0) {
    await scheduleEmail(
      process.env.ADMIN_EMAIL_SENDER,
      process.env.ADMIN_EMAIL_RECIPIENT,
      'URGENT! Bandcamp artist track fetching failed!',
      `Errors: ${JSON.stringify(combinedErrors)}`
    )
    return { result: combinedErrors, success: false }
  }

  return { success: true }
}
