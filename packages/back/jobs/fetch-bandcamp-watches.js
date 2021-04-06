const pg = require('../db/pg.js')
const R = require('ramda')
const sql = require('sql-template-strings')
const { addStoreTrackToUsers } = require('../routes/users/logic.js')
const bandcampApi = require('../routes/stores/bandcamp/bandcamp-api.js')
const { bandcampReleasesTransform } = require('../../chrome-extension/src/js/transforms/bandcamp.js')

const handleReleases = async (releaseUrls, users) => {
  const newReleases = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`SELECT store__release_url AS "releaseUrl"
FROM UNNEST(${releaseUrls}::TEXT[]) AS nr(store__release_url)
         NATURAL LEFT JOIN
     store__release
WHERE release_id IS NULL`
  )

  let releaseDetails = []
  for (const { releaseUrl } of newReleases) {
    try {
      console.log('fetching', releaseUrl)
      const releaseInfo = await bandcampApi.getReleaseAsync(releaseUrl)
      releaseDetails.push(releaseInfo)
    } catch (e) {
      console.error('Failed to fetch release details from', releaseUrl)
    }
  }

  const transformed = bandcampReleasesTransform(releaseDetails)

  for (const track of transformed) {
    await addStoreTrackToUsers('https://bandcamp.com', users, track)
  }
}

const fetchPlaylists = async () => {
  const playlistFollowDetails = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`SELECT playlist_store_id               AS id,
       store_playlist_type_store_id    AS type,
       array_agg(meta_account_user_id) AS users
FROM user__playlist_watch
         NATURAL JOIN playlist
         NATURAL JOIN store_playlist_type
         NATURAL JOIN store
WHERE store_name = 'Bandcamp'
  AND (playlist_last_update IS NULL OR playlist_last_update + interval '6 hours' < NOW())
GROUP BY 1, 2, playlist_last_update
ORDER BY playlist_last_update DESC NULLS FIRST
LIMIT 20
`
  )

  let count = 1
  for (const { id, type, users } of playlistFollowDetails) {
    try {
      console.log(`Fetching tracks for playlist ${count}/${playlistFollowDetails.length}: ${id}`)
      count++

      let transformed
      if (type === 'tag') {
        const releases = await bandcampApi.getTagReleasesAsync(id)

        const releaseUrls = R.uniq(R.flatten(releases.map(R.prop('items'))).map(R.prop('tralbum_url')))

        await handleReleases(releaseUrls, users)
      }

      await pg.queryAsync(
        // language=PostgreSQL
        sql`UPDATE playlist
      SET playlist_last_update = NOW()
      WHERE playlist_id = (SELECT playlist_id FROM playlist WHERE playlist_store_id = ${id})`
      )
    } catch (e) {
      console.error(e)
    }
  }
}

const fetchArtists = async () => {
  // TODO: share implementation between stores?
  const artistFollowDetails = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`SELECT store__artist_store_id          AS id,
               store__artist_url               AS url,
               array_agg(meta_account_user_id) AS users
        FROM store__artist_watch__user
                 NATURAL JOIN store__artist_watch
                 NATURAL JOIN store__artist
                 NATURAL JOIN store
        WHERE store_name = 'Bandcamp'
          AND (store__artist_last_update IS NULL OR store__artist_last_update + interval '6 hours' < NOW())
        GROUP BY 1, 2, store__artist_last_update
        ORDER BY store__artist_last_update DESC NULLS FIRST
        LIMIT 20
    `
  )

  let count = 1
  for (const { id, url, users } of artistFollowDetails) {
    try {
      console.log(`Fetching tracks for artists ${count}/${artistFollowDetails.length}: ${id}`)
      count++

      console.log(JSON.stringify({ url }, null, 2))
      const { releaseUrls } = await bandcampApi.getArtistAsync(url)
      console.log(JSON.stringify({ releaseUrls }, null, 2))
      await handleReleases(releaseUrls, users)
      console.log('handle')
      await pg.queryAsync(
        // language=PostgreSQL
        sql`UPDATE store__artist
      SET store__artist_last_update = NOW()
      WHERE store__artist_store_id = ${id}` // TODO: add index to the column
      )
    } catch (e) {
      console.error(e)
    }
  }
}

const fetchLabels = async () => {
  // TODO: share implementation between stores?
  const labelFollowDetails = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`SELECT store__label_store_id          AS id, -- TODO: use store__label_id instead?
               store__label_url               AS url,
               array_agg(meta_account_user_id) AS users
        FROM store__label_watch__user
                 NATURAL JOIN store__label_watch
                 NATURAL JOIN store__label
                 NATURAL JOIN store
        WHERE store_name = 'Bandcamp'
          AND (store__label_last_update IS NULL OR store__label_last_update + interval '6 hours' < NOW())
        GROUP BY 1, 2, store__label_last_update
        ORDER BY store__label_last_update DESC NULLS FIRST
        LIMIT 20
    `
  )

  let count = 1
  for (const { id, url, users } of labelFollowDetails) {
    try {
      console.log(`Fetching tracks for artists ${count}/${labelFollowDetails.length}: ${id}`)
      count++

      const { releaseUrls } = await bandcampApi.getLabelAsync(url)
      await handleReleases(releaseUrls, users)
      await pg.queryAsync(
        // language=PostgreSQL
        sql`UPDATE store__label
      SET store__label_last_update = NOW()
      WHERE store__label_store_id = ${id}` // TODO: add index to the column
      )
    } catch (e) {
      console.error(e)
    }
  }
}

const fetchBandcampWatches = async () => {
  await fetchPlaylists()
  await fetchArtists()
  await fetchLabels()
}

module.exports = fetchBandcampWatches
