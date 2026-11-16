const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const bandcampApi = require('./bandcamp-api')
const logger = require('fomoplayer_shared').logger(__filename)

const { isRedirectStreamUrl, streamUrlRefreshAgeMs } = bandcampApi.static

// Bandcamp stream URLs, stored on each preview as store__track_preview_url_ephemeral so playback and the preview audio
// prefetch job do not look the release up for every track. Bandcamp previews have no permanent URL
// (store__track_preview_url is NULL). Only bandcamp.com/stream_redirect URLs are stored: they stay usable for days,
// while the CDN URLs of a scraped release page expire within a day. The watch job stores them with the tracks it adds
// (addStoreTrack, from the transform's url_ephemeral). A stored URL is used until it is
// BANDCAMP_STREAM_URL_REFRESH_AGE_DAYS old (13 by default) or until it fails; the release is then looked up again and
// the URLs of all its tracks are replaced, as the others were issued at the same time.

const findStreamUrl = (release, storeTrackId) =>
  (release?.trackinfo || []).find((track) => String(track.track_id) === String(storeTrackId))?.file?.['mp3-128'] || null

// Stores the stream URL of every preview of the release's tracks that is in the database.
const storeStreamUrls = async (release) => {
  const streams = (release?.trackinfo || [])
    .map((track) => ({ store_track_id: String(track.track_id), url: track.file?.['mp3-128'] }))
    .filter(({ store_track_id, url }) => store_track_id && url && isRedirectStreamUrl(url))
  if (streams.length === 0) return 0
  const rows = await pg.queryRowsAsync(
    sql`-- storeStreamUrls
UPDATE store__track_preview p
SET store__track_preview_url_ephemeral            = s.url
  , store__track_preview_url_ephemeral_fetched_at = NOW()
FROM JSON_TO_RECORDSET(${JSON.stringify(streams)}) AS s (store_track_id TEXT, url TEXT)
  JOIN store__track st ON st.store__track_store_id = s.store_track_id
  JOIN store ON store.store_id = st.store_id AND store.store_name = 'Bandcamp'
WHERE p.store__track_id = st.store__track_id
  AND p.store__track_preview_url IS NULL
RETURNING p.store__track_preview_id`,
  )
  return rows.length
}

// The stored stream URL of a preview while it is younger than the refresh age.
const queryStoredStreamUrl = async (previewId) => {
  const [row] = await pg.queryRowsAsync(
    sql`-- queryStoredStreamUrl
SELECT store__track_preview_url_ephemeral AS url
FROM store__track_preview
WHERE store__track_preview_id = ${previewId}
  AND store__track_preview_url_ephemeral_fetched_at >
      NOW() - ${streamUrlRefreshAgeMs}::FLOAT8 * INTERVAL '1 millisecond'`,
  )
  return row?.url || null
}

// Looks the release up (with priority when a listener is waiting) and stores the stream URLs of all its tracks.
const refreshReleaseStreamUrls = async (
  releaseUrl,
  { priority = false, fetchRelease = bandcampApi.fetchRelease } = {},
) => {
  const release = await fetchRelease(releaseUrl, { priority })
  try {
    await storeStreamUrls(release)
  } catch (error) {
    logger.warn('Could not store Bandcamp stream URLs', { releaseUrl, error: error.message })
  }
  return release
}

// The stream URL of a preview: the stored one unless refresh is asked for (a listener's player could not play it),
// otherwise looked up from the release.
const getStreamUrl = async (
  { previewId, storeTrackId, releaseUrl },
  { refresh = false, priority = false, fetchRelease } = {},
) => {
  if (!refresh) {
    const stored = await queryStoredStreamUrl(previewId)
    if (stored) return stored
  }
  const release = await refreshReleaseStreamUrls(releaseUrl, { priority, fetchRelease })
  return findStreamUrl(release, storeTrackId)
}

module.exports = {
  findStreamUrl,
  storeStreamUrls,
  queryStoredStreamUrl,
  refreshReleaseStreamUrls,
  getStreamUrl,
}
