const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

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
