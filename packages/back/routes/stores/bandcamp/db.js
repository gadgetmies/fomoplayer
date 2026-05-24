const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const BPromise = require('bluebird')
const { ensureArtistExists, refreshTrackDetails } = require('../../shared/db/store.js')

const STORE_URL = 'https://bandcamp.com'

// Follow-search candidates drawn from artists/labels/playlists already in the
// database for Bandcamp, typed by what the DB knows rather than Bandcamp's
// unreliable is_label flag. An artist with an active mislabeled flag (it is
// really a label) is returned as a label, and vice versa, so corrected entities
// land in the right group even before they are converted. Result shape matches
// the store autocomplete: { type, url, id, name } where id is the Bandcamp
// store id (for playlists, the discover URL doubles as the store id).
module.exports.searchFollowEntities = async (query) => {
  const trimmed = (query || '').trim()
  if (!trimmed) return []
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- searchFollowEntities
SELECT type, url, id, name
FROM (
  SELECT (CASE WHEN ma.bandcamp_mislabeled_artist_id IS NOT NULL THEN 'label' ELSE 'artist' END)::TEXT AS type
       , sa.store__artist_url                                                                          AS url
       , sa.store__artist_store_id                                                                     AS id
       , a.artist_name                                                                                 AS name
  FROM
    artist a
    JOIN store__artist sa ON sa.artist_id = a.artist_id
    JOIN store s ON s.store_id = sa.store_id AND s.store_url = ${STORE_URL}
    LEFT JOIN bandcamp_mislabeled_artist ma
      ON ma.artist_id = a.artist_id AND ma.bandcamp_mislabeled_artist_status = 'new'
  WHERE sa.store__artist_url IS NOT NULL
    AND to_tsvector('simple', unaccent(a.artist_name)) @@ websearch_to_tsquery('simple', unaccent(${trimmed}))

  UNION ALL
  SELECT (CASE WHEN ml.bandcamp_mislabeled_label_id IS NOT NULL THEN 'artist' ELSE 'label' END)::TEXT
       , sl.store__label_url
       , sl.store__label_store_id
       , l.label_name
  FROM
    label l
    JOIN store__label sl ON sl.label_id = l.label_id
    JOIN store s ON s.store_id = sl.store_id AND s.store_url = ${STORE_URL}
    LEFT JOIN bandcamp_mislabeled_label ml
      ON ml.label_id = l.label_id AND ml.bandcamp_mislabeled_label_status = 'new'
  WHERE to_tsvector('simple', unaccent(l.label_name)) @@ websearch_to_tsquery('simple', unaccent(${trimmed}))

  UNION ALL
  SELECT 'playlist'
       , p.playlist_store_id
       , p.playlist_store_id
       , p.playlist_title
  FROM
    playlist p
    JOIN store_playlist_type spt ON spt.store_playlist_type_id = p.store_playlist_type_id
    JOIN store s ON s.store_id = spt.store_id AND s.store_url = ${STORE_URL}
  WHERE to_tsvector('simple', unaccent(p.playlist_title)) @@ websearch_to_tsquery('simple', unaccent(${trimmed}))
) results
ORDER BY LENGTH(name) ASC
LIMIT 100
`,
  )
}

module.exports.queryAlbumUrl = (storeId, storeTrackId) =>
  pg
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- queryAlbumUrl
SELECT
  store__release_url
FROM
  store__release
  NATURAL JOIN release
  NATURAL JOIN release__track
  NATURAL JOIN store__track
WHERE
    store__track_store_id = ${storeTrackId}::TEXT
AND store_id = ${storeId}
    `,
    )
    .then(([{ store__release_url }]) => store__release_url)

module.exports.queryTrackStoreId = (trackId) =>
  pg
    .queryRowsAsync(
      // language=PostgreSQL
      sql`-- queryTrackStoreId
SELECT
  store__track_store_id
FROM store__track
WHERE
  store__track_id = ${trackId}
`,
    )
    .then(([{ store__track_store_id }]) => store__track_store_id)

module.exports.queryKnownReleaseUrls = async (storeId, urls) => {
  if (!urls || urls.length === 0) return new Set()
  const rows = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryKnownReleaseUrls
SELECT store__release_url AS url
FROM   store__release
WHERE  store_id            = ${storeId}
  AND  store__release_url  = ANY(${urls})
`,
  )
  return new Set(rows.map((r) => r.url))
}

// --- Label artist re-fetch queue ---------------------------------------------

// Queue (or re-queue) a label whose Bandcamp tracks should be re-attributed to
// their real artists. Re-queuing resets a previous done/error row to pending.
module.exports.enqueueLabelArtistRefetch = async (labelId) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- enqueueLabelArtistRefetch
INSERT INTO bandcamp_label_artist_refetch (label_id)
VALUES (${labelId})
ON CONFLICT (label_id) DO UPDATE
  SET bandcamp_label_artist_refetch_status         = 'pending'
    , bandcamp_label_artist_refetch_added          = NOW()
    , bandcamp_label_artist_refetch_started        = NULL
    , bandcamp_label_artist_refetch_finished       = NULL
    , bandcamp_label_artist_refetch_error          = NULL
    , bandcamp_label_artist_refetch_releases_total = NULL
    , bandcamp_label_artist_refetch_releases_done  = 0
`,
  )

module.exports.enqueueArtistTrackRefetch = async (artistId) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- enqueueArtistTrackRefetch
INSERT INTO bandcamp_label_artist_refetch (artist_id)
VALUES (${artistId})
ON CONFLICT (artist_id) DO UPDATE
  SET bandcamp_label_artist_refetch_status         = 'pending'
    , bandcamp_label_artist_refetch_added          = NOW()
    , bandcamp_label_artist_refetch_started        = NULL
    , bandcamp_label_artist_refetch_finished       = NULL
    , bandcamp_label_artist_refetch_error          = NULL
    , bandcamp_label_artist_refetch_releases_total = NULL
    , bandcamp_label_artist_refetch_releases_done  = 0
`,
  )

module.exports.getPendingRefetches = async () =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getPendingRefetches
SELECT r.bandcamp_label_artist_refetch_id            AS id
     , r.label_id                                    AS "labelId"
     , r.artist_id                                   AS "artistId"
     , COALESCE(l.label_name, a.artist_name)         AS name
     , CASE WHEN r.label_id IS NOT NULL THEN 'label' ELSE 'artist' END AS type
     , r.bandcamp_label_artist_refetch_releases_done AS "releasesDone"
FROM
  bandcamp_label_artist_refetch r
  LEFT JOIN label l ON l.label_id = r.label_id
  LEFT JOIN artist a ON a.artist_id = r.artist_id
WHERE r.bandcamp_label_artist_refetch_status = 'pending'
ORDER BY r.bandcamp_label_artist_refetch_added ASC
`,
  )

module.exports.markLabelArtistRefetchStarted = async (id, releasesTotal) =>
  pg.queryAsync(
    sql`-- markLabelArtistRefetchStarted
UPDATE bandcamp_label_artist_refetch
SET bandcamp_label_artist_refetch_started        = COALESCE(bandcamp_label_artist_refetch_started, NOW())
  , bandcamp_label_artist_refetch_releases_total = ${releasesTotal}
WHERE bandcamp_label_artist_refetch_id = ${id}`,
  )

module.exports.setLabelArtistRefetchProgress = async (id, releasesDone) =>
  pg.queryAsync(
    sql`-- setLabelArtistRefetchProgress
UPDATE bandcamp_label_artist_refetch
SET bandcamp_label_artist_refetch_releases_done = ${releasesDone}
WHERE bandcamp_label_artist_refetch_id = ${id}`,
  )

module.exports.markLabelArtistRefetchDone = async (id) =>
  pg.queryAsync(
    sql`-- markLabelArtistRefetchDone
UPDATE bandcamp_label_artist_refetch
SET bandcamp_label_artist_refetch_status   = 'done'
  , bandcamp_label_artist_refetch_finished = NOW()
  , bandcamp_label_artist_refetch_error    = NULL
WHERE bandcamp_label_artist_refetch_id = ${id}`,
  )

module.exports.markLabelArtistRefetchError = async (id, message) =>
  pg.queryAsync(
    sql`-- markLabelArtistRefetchError
UPDATE bandcamp_label_artist_refetch
SET bandcamp_label_artist_refetch_status   = 'error'
  , bandcamp_label_artist_refetch_finished = NOW()
  , bandcamp_label_artist_refetch_error    = ${message}
WHERE bandcamp_label_artist_refetch_id = ${id}`,
  )

// Distinct Bandcamp release URLs backing a label's tracks, ordered so the
// re-fetch job can resume from where it stopped (e.g. after a rate limit).
module.exports.queryLabelBandcampReleaseUrls = async (labelId) => {
  const rows = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryLabelBandcampReleaseUrls
SELECT DISTINCT sr.store__release_url AS url
FROM
  track__label tl
  JOIN release__track rt ON rt.track_id = tl.track_id
  JOIN store__release sr ON sr.release_id = rt.release_id
  JOIN store s ON s.store_id = sr.store_id AND s.store_url = ${STORE_URL}
WHERE tl.label_id = ${labelId}
  AND sr.store__release_url IS NOT NULL
ORDER BY url ASC
`,
  )
  return rows.map((r) => r.url)
}

// Distinct Bandcamp release URLs published on an artist's own subdomain. Uses
// the store page URL rather than current track credits, since the whole point
// is to repair tracks that are currently credited to the wrong artist.
module.exports.queryArtistBandcampReleaseUrls = async (artistId) => {
  const rows = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryArtistBandcampReleaseUrls
SELECT DISTINCT sr.store__release_url AS url
FROM
  store__artist sa
  JOIN store s ON s.store_id = sa.store_id AND s.store_url = ${STORE_URL}
  JOIN store__release sr ON sr.store_id = sa.store_id
    AND sr.store__release_url LIKE sa.store__artist_url || '/%'
WHERE sa.artist_id = ${artistId}
  AND sa.store__artist_url IS NOT NULL
ORDER BY url ASC
`,
  )
  return rows.map((r) => r.url)
}

// --- Artist subdomain / name mismatch detection & repair --------------------

// All Bandcamp artist mappings (subdomain + linked artist name) that are not
// already dismissed, for the detection job to score by name/subdomain
// similarity.
module.exports.getBandcampArtistMappings = async () =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getBandcampArtistMappings
SELECT sa.store__artist_id       AS "storeArtistId"
     , sa.store__artist_store_id AS subdomain
     , sa.store__artist_url      AS url
     , a.artist_name             AS name
FROM
  store__artist sa
  JOIN store s ON s.store_id = sa.store_id AND s.store_url = ${STORE_URL}
  JOIN artist a ON a.artist_id = sa.artist_id
WHERE sa.store__artist_url IS NOT NULL
  AND NOT EXISTS (SELECT 1
                  FROM bandcamp_artist_name_mismatch m
                  WHERE m.store__artist_id = sa.store__artist_id
                    AND m.bandcamp_artist_name_mismatch_status = 'ignored')
`,
  )

module.exports.flagArtistNameMismatch = async ({ storeArtistId, subdomain, currentName, similarity }) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- flagArtistNameMismatch
INSERT INTO bandcamp_artist_name_mismatch
  (store__artist_id, bandcamp_artist_name_mismatch_subdomain, bandcamp_artist_name_mismatch_current_name,
   bandcamp_artist_name_mismatch_similarity, bandcamp_artist_name_mismatch_checked_at)
VALUES (${storeArtistId}, ${subdomain}, ${currentName}, ${similarity}, NOW())
ON CONFLICT (store__artist_id) DO UPDATE
  SET bandcamp_artist_name_mismatch_subdomain    = EXCLUDED.bandcamp_artist_name_mismatch_subdomain
    , bandcamp_artist_name_mismatch_current_name = EXCLUDED.bandcamp_artist_name_mismatch_current_name
    , bandcamp_artist_name_mismatch_similarity   = EXCLUDED.bandcamp_artist_name_mismatch_similarity
    , bandcamp_artist_name_mismatch_checked_at   = NOW()
`,
  )

module.exports.getArtistNameMismatches = async () =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getArtistNameMismatches
SELECT m.store__artist_id                         AS "storeArtistId"
     , sa.artist_id                               AS "artistId"
     , a.artist_name                              AS "currentName"
     , m.bandcamp_artist_name_mismatch_subdomain  AS subdomain
     , sa.store__artist_url                       AS url
     , m.bandcamp_artist_name_mismatch_similarity AS similarity
FROM
  bandcamp_artist_name_mismatch m
  JOIN store__artist sa ON sa.store__artist_id = m.store__artist_id
  JOIN artist a ON a.artist_id = sa.artist_id
WHERE m.bandcamp_artist_name_mismatch_status = 'new'
ORDER BY m.bandcamp_artist_name_mismatch_similarity ASC NULLS FIRST
`,
  )

module.exports.ignoreArtistNameMismatch = async (storeArtistId) =>
  pg.queryAsync(
    sql`-- ignoreArtistNameMismatch
UPDATE bandcamp_artist_name_mismatch
SET bandcamp_artist_name_mismatch_status = 'ignored'
WHERE store__artist_id = ${storeArtistId}`,
  )

module.exports.clearArtistNameMismatch = async (storeArtistId) =>
  pg.queryAsync(
    sql`-- clearArtistNameMismatch
DELETE FROM bandcamp_artist_name_mismatch
WHERE store__artist_id = ${storeArtistId}
  AND bandcamp_artist_name_mismatch_status = 'new'`,
  )

const STORE_ARTIST_SELECT = (where) =>
  sql`-- store__artist lookup
SELECT sa.store__artist_id       AS "storeArtistId"
     , sa.artist_id              AS "artistId"
     , sa.store__artist_store_id AS subdomain
     , sa.store__artist_url      AS url
     , a.artist_name             AS "currentName"
FROM
  store__artist sa
  JOIN store s ON s.store_id = sa.store_id AND s.store_url = ${STORE_URL}
  JOIN artist a ON a.artist_id = sa.artist_id
WHERE `.append(where)

module.exports.getStoreArtistById = async (storeArtistId) => {
  const [row] = await pg.queryRowsAsync(STORE_ARTIST_SELECT(sql`sa.store__artist_id = ${storeArtistId}`))
  return row || null
}

module.exports.getStoreArtistByUrl = async (url) => {
  const [row] = await pg.queryRowsAsync(
    STORE_ARTIST_SELECT(sql`TRIM(TRAILING '/' FROM sa.store__artist_url) = TRIM(TRAILING '/' FROM ${url})`),
  )
  return row || null
}

module.exports.getBandcampStoreArtistsForArtist = async (artistId) =>
  pg.queryRowsAsync(STORE_ARTIST_SELECT(sql`sa.artist_id = ${artistId}`))

// Replace each transformed track's artist credits with the freshly extracted
// ones, matched to the database by Bandcamp store track id. When a labelId is
// given (label re-fetch) the label credit is re-affirmed; for artist re-fetches
// the labels are left untouched. Returns the number of tracks updated.
module.exports.reattributeTracksArtists = async (tracks, labelId = null) => {
  let updated = 0
  await BPromise.using(pg.getTransaction(), async (tx) => {
    const updatedTrackIds = []
    for (const track of tracks) {
      const [row] = await tx.queryRowsAsync(
        // language=PostgreSQL
        sql`-- reattributeTracksArtists find track
SELECT track_id AS "trackId"
FROM
  store__track
  NATURAL JOIN store
WHERE store__track_store_id = ${track.id}
  AND store_url = ${STORE_URL}`,
      )
      if (!row) continue
      const trackId = row.trackId

      const artists = []
      for (const artist of track.artists) {
        artists.push(await ensureArtistExists(tx, STORE_URL, artist, null))
      }
      if (artists.length === 0) continue

      await tx.queryAsync(sql`DELETE FROM track__artist WHERE track_id = ${trackId}`)
      for (const { id, role } of artists) {
        await tx.queryAsync(
          // language=PostgreSQL
          sql`-- reattributeTracksArtists add artist
INSERT INTO track__artist (track_id, artist_id, track__artist_role)
VALUES (${trackId}, ${id}, ${role})
ON CONFLICT ON CONSTRAINT track__artist_track_id_artist_id_track__artist_role_key DO NOTHING`,
        )
      }
      if (labelId) {
        await tx.queryAsync(
          // language=PostgreSQL
          sql`-- reattributeTracksArtists ensure label
INSERT INTO track__label (track_id, label_id)
VALUES (${trackId}, ${labelId})
ON CONFLICT ON CONSTRAINT track__label_track_id_label_id_key DO NOTHING`,
        )
      }
      updatedTrackIds.push(trackId)
      updated++
    }
    await refreshTrackDetails(tx, updatedTrackIds)
  })
  return updated
}
