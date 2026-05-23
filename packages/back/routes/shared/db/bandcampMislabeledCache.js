const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg

const BANDCAMP_STORE_URL = 'https://bandcamp.com'

// Cached results of the mislabeled-entity analysis. Rows are written by the
// `analyseBandcampMislabeled` job (heuristic candidates confirmed by fetching
// the Bandcamp page) and by the Bandcamp artist fetch when it lands on a page
// that is actually a label. The admin UI reads from here instead of recomputing
// the (page-fetching) analysis on every request.

const toNumberOrNull = (value) => (value === null || value === undefined ? null : Number(value))

// status='new' rows joined to their entity for the admin list and for
// re-verification by the analysis job.
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

module.exports.upsertConfirmedMislabeled = async (type, rows) => {
  for (const { id, url, reason, similarity, detectedPageType } of rows) {
    if (type === 'artist') {
      await pg.queryAsync(sql`-- upsertConfirmedMislabeled artist
        INSERT INTO bandcamp_mislabeled_artist
          (artist_id, bandcamp_mislabeled_artist_url, bandcamp_mislabeled_artist_reason,
           bandcamp_mislabeled_artist_similarity, bandcamp_mislabeled_artist_detected_page_type,
           bandcamp_mislabeled_artist_checked_at)
        VALUES (${id}, ${url}, ${reason}, ${similarity ?? null}, ${detectedPageType ?? null}, NOW())
        ON CONFLICT (artist_id) DO UPDATE
          SET bandcamp_mislabeled_artist_url               = EXCLUDED.bandcamp_mislabeled_artist_url
            , bandcamp_mislabeled_artist_reason            = EXCLUDED.bandcamp_mislabeled_artist_reason
            , bandcamp_mislabeled_artist_similarity        = EXCLUDED.bandcamp_mislabeled_artist_similarity
            , bandcamp_mislabeled_artist_detected_page_type = EXCLUDED.bandcamp_mislabeled_artist_detected_page_type
            , bandcamp_mislabeled_artist_checked_at         = NOW()`)
    } else {
      await pg.queryAsync(sql`-- upsertConfirmedMislabeled label
        INSERT INTO bandcamp_mislabeled_label
          (label_id, bandcamp_mislabeled_label_url, bandcamp_mislabeled_label_reason,
           bandcamp_mislabeled_label_similarity, bandcamp_mislabeled_label_detected_page_type,
           bandcamp_mislabeled_label_checked_at)
        VALUES (${id}, ${url}, ${reason}, ${similarity ?? null}, ${detectedPageType ?? null}, NOW())
        ON CONFLICT (label_id) DO UPDATE
          SET bandcamp_mislabeled_label_url               = EXCLUDED.bandcamp_mislabeled_label_url
            , bandcamp_mislabeled_label_reason            = EXCLUDED.bandcamp_mislabeled_label_reason
            , bandcamp_mislabeled_label_similarity        = EXCLUDED.bandcamp_mislabeled_label_similarity
            , bandcamp_mislabeled_label_detected_page_type = EXCLUDED.bandcamp_mislabeled_label_detected_page_type
            , bandcamp_mislabeled_label_checked_at         = NOW()`)
    }
  }
}

// Drop status='new' rows the analysis just checked but could no longer confirm
// (e.g. the page is now correctly typed, or the bogus URL was cleared).
// 'ignored' rows are left untouched so dismissed false positives stay dismissed.
module.exports.removeUnconfirmedMislabeled = async (type, checkedIds, confirmedIds) => {
  if (checkedIds.length === 0) return
  if (type === 'artist') {
    await pg.queryAsync(sql`-- removeUnconfirmedMislabeled artist
      DELETE FROM bandcamp_mislabeled_artist
      WHERE bandcamp_mislabeled_artist_status = 'new'
        AND artist_id = ANY (${checkedIds})
        AND NOT (artist_id = ANY (${confirmedIds}))`)
  } else {
    await pg.queryAsync(sql`-- removeUnconfirmedMislabeled label
      DELETE FROM bandcamp_mislabeled_label
      WHERE bandcamp_mislabeled_label_status = 'new'
        AND label_id = ANY (${checkedIds})
        AND NOT (label_id = ANY (${confirmedIds}))`)
  }
}

// Called from the Bandcamp artist fetch when a followed artist's page turns out
// to be a label. Resolves the artist by its Bandcamp store URL and caches it.
module.exports.flagSuspectedMislabeledArtistByUrl = async (url) => {
  await pg.queryAsync(sql`-- flagSuspectedMislabeledArtistByUrl
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
