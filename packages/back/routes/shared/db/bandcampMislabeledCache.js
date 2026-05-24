const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg

const BANDCAMP_STORE_URL = 'https://bandcamp.com'

// Cache of Bandcamp artists/labels detected as mislabeled — their subdomain page
// actually belongs to the other entity type. Rows are written by the Bandcamp
// fetch jobs as they classify the page they already load for each watched
// artist/label, and read by the admin UI. No page fetching happens here.

const toNumberOrNull = (value) => (value === null || value === undefined ? null : Number(value))

// status='new' rows joined to their entity for the admin list.
module.exports.getCachedMislabeled = async (type) => {
  const rows =
    type === 'artist'
      ? await pg.queryRowsAsync(sql`-- getCachedMislabeled artist
          SELECT m.artist_id                                  AS id
               , a.artist_name                                AS name
               , m.bandcamp_mislabeled_artist_url             AS url
               , m.bandcamp_mislabeled_artist_reason          AS reason
               , m.bandcamp_mislabeled_artist_similarity      AS similarity
          FROM
            bandcamp_mislabeled_artist m
            JOIN artist a ON a.artist_id = m.artist_id
          WHERE m.bandcamp_mislabeled_artist_status = 'new'
          ORDER BY m.bandcamp_mislabeled_artist_similarity ASC NULLS LAST`)
      : await pg.queryRowsAsync(sql`-- getCachedMislabeled label
          SELECT m.label_id                                   AS id
               , l.label_name                                 AS name
               , m.bandcamp_mislabeled_label_url              AS url
               , m.bandcamp_mislabeled_label_reason           AS reason
               , m.bandcamp_mislabeled_label_similarity       AS similarity
          FROM
            bandcamp_mislabeled_label m
            JOIN label l ON l.label_id = m.label_id
          WHERE m.bandcamp_mislabeled_label_status = 'new'
          ORDER BY m.bandcamp_mislabeled_label_similarity ASC NULLS LAST`)

  return rows.map((row) => ({ ...row, similarity: toNumberOrNull(row.similarity) }))
}

// Flag the entity behind a Bandcamp store URL as mislabeled: its page resolved
// to the other entity type. Idempotent; preserves an existing 'ignored' status.
module.exports.flagMislabeledByUrl = async (type, url) => {
  if (type === 'artist') {
    await pg.queryAsync(sql`-- flagMislabeledByUrl artist
      INSERT INTO bandcamp_mislabeled_artist
        (artist_id, bandcamp_mislabeled_artist_url, bandcamp_mislabeled_artist_reason,
         bandcamp_mislabeled_artist_detected_page_type, bandcamp_mislabeled_artist_checked_at)
      SELECT sa.artist_id, sa.store__artist_url, 'page_is_label', 'label', NOW()
      FROM
        store__artist sa
        JOIN store s ON s.store_id = sa.store_id AND s.store_url = ${BANDCAMP_STORE_URL}
      WHERE sa.store__artist_url = ${url}
      ON CONFLICT (artist_id) DO UPDATE
        SET bandcamp_mislabeled_artist_detected_page_type = 'label'
          , bandcamp_mislabeled_artist_checked_at         = NOW()`)
  } else {
    await pg.queryAsync(sql`-- flagMislabeledByUrl label
      INSERT INTO bandcamp_mislabeled_label
        (label_id, bandcamp_mislabeled_label_url, bandcamp_mislabeled_label_reason,
         bandcamp_mislabeled_label_detected_page_type, bandcamp_mislabeled_label_checked_at)
      SELECT sl.label_id, sl.store__label_url, 'page_is_artist', 'artist', NOW()
      FROM
        store__label sl
        JOIN store s ON s.store_id = sl.store_id AND s.store_url = ${BANDCAMP_STORE_URL}
      WHERE sl.store__label_url = ${url}
      ON CONFLICT (label_id) DO UPDATE
        SET bandcamp_mislabeled_label_detected_page_type = 'artist'
          , bandcamp_mislabeled_label_checked_at         = NOW()`)
  }
}

// Clear a mislabeled flag once a page is confirmed to be the correct type.
// 'ignored' rows are left untouched so dismissed entries stay dismissed.
module.exports.clearMislabeledByUrl = async (type, url) => {
  if (type === 'artist') {
    await pg.queryAsync(sql`-- clearMislabeledByUrl artist
      DELETE FROM bandcamp_mislabeled_artist
      WHERE bandcamp_mislabeled_artist_status = 'new'
        AND artist_id IN (SELECT sa.artist_id
                          FROM
                            store__artist sa
                            JOIN store s ON s.store_id = sa.store_id AND s.store_url = ${BANDCAMP_STORE_URL}
                          WHERE sa.store__artist_url = ${url})`)
  } else {
    await pg.queryAsync(sql`-- clearMislabeledByUrl label
      DELETE FROM bandcamp_mislabeled_label
      WHERE bandcamp_mislabeled_label_status = 'new'
        AND label_id IN (SELECT sl.label_id
                         FROM
                           store__label sl
                           JOIN store s ON s.store_id = sl.store_id AND s.store_url = ${BANDCAMP_STORE_URL}
                         WHERE sl.store__label_url = ${url})`)
  }
}

module.exports.ignoreCachedMislabeled = async (type, id) => {
  if (type === 'artist') {
    await pg.queryAsync(sql`-- ignoreCachedMislabeled artist
      UPDATE bandcamp_mislabeled_artist
      SET bandcamp_mislabeled_artist_status = 'ignored'
      WHERE artist_id = ${id}`)
  } else {
    await pg.queryAsync(sql`-- ignoreCachedMislabeled label
      UPDATE bandcamp_mislabeled_label
      SET bandcamp_mislabeled_label_status = 'ignored'
      WHERE label_id = ${id}`)
  }
}
