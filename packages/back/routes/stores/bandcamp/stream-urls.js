const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const bandcampApi = require('./bandcamp-api')
const logger = require('fomoplayer_shared').logger(__filename)

const { isRedirectStreamUrl, streamUrlRefreshAgeMs } = bandcampApi.static

// Bandcamp stream URLs, stored per preview so playback and the preview audio prefetch job do not look the release
// up for every track. Only bandcamp.com/stream_redirect URLs are stored: they stay usable for days, while the CDN
// URLs of a scraped release page expire within a day. A stored URL is used until it is
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
INSERT INTO store__track_preview_stream (store__track_preview_id, store__track_preview_stream_url)
SELECT p.store__track_preview_id, s.url
FROM JSON_TO_RECORDSET(${JSON.stringify(streams)}) AS s (store_track_id TEXT, url TEXT)
  JOIN store__track st ON st.store__track_store_id = s.store_track_id
  JOIN store ON store.store_id = st.store_id AND store.store_name = 'Bandcamp'
  JOIN store__track_preview p ON p.store__track_id = st.store__track_id
ON CONFLICT (store__track_preview_id) DO UPDATE
  SET store__track_preview_stream_url        = EXCLUDED.store__track_preview_stream_url
    , store__track_preview_stream_fetched_at = NOW()
RETURNING store__track_preview_id`,
  )
  return rows.length
}

// The stored stream URL of a preview while it is younger than the refresh age.
const queryStoredStreamUrl = async (previewId) => {
  const [row] = await pg.queryRowsAsync(
    sql`-- queryStoredStreamUrl
SELECT store__track_preview_stream_url AS url
FROM store__track_preview_stream
WHERE store__track_preview_id = ${previewId}
  AND store__track_preview_stream_fetched_at > NOW() - ${streamUrlRefreshAgeMs}::FLOAT8 * INTERVAL '1 millisecond'`,
  )
  return row?.url || null
}

const storeStreamUrl = (previewId, url) =>
  pg.queryAsync(
    sql`-- storeStreamUrl
INSERT INTO store__track_preview_stream (store__track_preview_id, store__track_preview_stream_url)
VALUES (${previewId}, ${url})
ON CONFLICT (store__track_preview_id) DO UPDATE
  SET store__track_preview_stream_url        = EXCLUDED.store__track_preview_stream_url
    , store__track_preview_stream_fetched_at = NOW()`,
  )

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

// A known stream URL for the preview without asking Bandcamp: the stored one, or one the Bandcamp client kept from a
// release fetched before the preview was stored (a newly added track), which is then stored.
const knownStreamUrl = async ({ previewId, storeTrackId }) => {
  const stored = await queryStoredStreamUrl(previewId)
  if (stored) return stored
  const kept = bandcampApi.getCachedStreamUrl(storeTrackId)
  if (kept && isRedirectStreamUrl(kept)) await storeStreamUrl(previewId, kept)
  return kept
}

// The stream URL of a preview: a known one unless refresh is asked for (a listener's player could not play it),
// otherwise looked up from the release.
const getStreamUrl = async (
  { previewId, storeTrackId, releaseUrl },
  { refresh = false, priority = false, fetchRelease } = {},
) => {
  if (!refresh) {
    const known = await knownStreamUrl({ previewId, storeTrackId })
    if (known) return known
  } else {
    bandcampApi.forgetStreamUrl(storeTrackId)
  }
  const release = await refreshReleaseStreamUrls(releaseUrl, { priority, fetchRelease })
  return findStreamUrl(release, storeTrackId)
}

module.exports = {
  findStreamUrl,
  storeStreamUrls,
  queryStoredStreamUrl,
  knownStreamUrl,
  refreshReleaseStreamUrls,
  getStreamUrl,
}
