const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const logger = require('fomoplayer_shared').logger(__filename)
const R = require('ramda')
const BPromise = require('bluebird')
const {
  getCachedMislabeled,
  ignoreCachedMislabeled,
  flagMislabeledById,
} = require('../shared/db/bandcampMislabeledCache')
const { ensureLabelExists } = require('../shared/db/store')

const BANDCAMP_STORE_URL = 'https://bandcamp.com'

module.exports.mergeTracks = async ({ trackToBeDeleted, trackToKeep }) => {
  await pg.queryAsync(sql`
-- Merge tracks
SELECT merge_tracks(${trackToKeep}, ${trackToBeDeleted});
  `)
}

module.exports.getJobs = async () => {
  const rows = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getJobs
SELECT j.job_name         AS name
     , js.job_schedule    AS schedule
     , j.job_enabled      AS enabled
     , lr.job_run_started AS "lastRunStarted"
     , lr.job_run_ended   AS "lastRunEnded"
     , lr.job_run_success AS "lastRunSuccess"
     , EXISTS (SELECT 1
               FROM job_run r
               WHERE r.job_id = j.job_id
                 AND r.job_run_ended IS NULL) AS running
FROM
  job j
  LEFT JOIN job_schedule js ON js.job_id = j.job_id
  LEFT JOIN LATERAL (SELECT job_run_started, job_run_ended, job_run_success
                     FROM job_run r
                     WHERE r.job_id = j.job_id
                     ORDER BY job_run_started DESC
                     LIMIT 1) lr ON TRUE
ORDER BY j.job_name`,
  )
  return rows.map((row) => ({
    name: row.name,
    schedule: row.schedule,
    enabled: row.enabled,
    running: row.running,
    lastRun: row.lastRunStarted
      ? { started: row.lastRunStarted, ended: row.lastRunEnded, success: row.lastRunSuccess }
      : null,
  }))
}

module.exports.getQueryResults = async () =>
  await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
      -- Query radiator results
      SELECT job_name
           , ARRAY_AGG(JSON_BUILD_OBJECT('started', job_run_started, 'success', job_run_success, 'result',
                                         job_run_result) ORDER BY job_run_started DESC) AS results
      FROM
        job
        NATURAL JOIN job_run
      WHERE job_name LIKE '%.sql'
        AND job_run_started > NOW() - INTERVAL '1 week'
      GROUP BY job_name
    `,
  )

module.exports.getConfigs = async () =>
  await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
        -- Query radiator config
        SELECT
            radiator_config_id AS id
          , radiator_config_name AS name
          , radiator_config_lens AS lens
          , radiator_config_config AS config
        FROM
            radiator_config
    `,
  )

module.exports.storeConfig = async ({ config, lens, name }) => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`
        -- Store radiator config
        INSERT
        INTO
            radiator_config (radiator_config_name, radiator_config_lens, radiator_config_config)
        VALUES
            (${name}, ${lens}, ${config})
        ON CONFLICT (radiator_config_name) DO UPDATE
            SET
                radiator_config_lens = ${lens}
              , radiator_config_config = ${config}
    `,
  )

  const [details] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
        -- Query radiator config
        SELECT
            radiator_config_id     AS id
          , radiator_config_name   AS name
          , radiator_config_lens   AS lens
          , radiator_config_config AS config
        FROM
            radiator_config
        WHERE
            radiator_config_name = ${name}
    `,
  )

  return details
}

module.exports.queryNextTracksToAnalyse = async ({ model, batch_size, purchased }) => {
  logger.info(`Searching for ${purchased ? 'purchased' : 'new'}`)
  if (!model) throw new Error('Model not set')
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- Query next tracks to analyse
SELECT track_id
     , track_isrc
     , JSON_AGG(
    JSON_BUILD_OBJECT('preview_id', store__track_preview_id,
                      'url', store__track_preview_url,
                      'start_ms', store__track_preview_start_ms,
                      'end_ms', store__track_preview_end_ms)
       ) AS previews
FROM
  track
  NATURAL JOIN store__track
  NATURAL JOIN store__track_preview p
  NATURAL LEFT JOIN track__cart
  NATURAL LEFT JOIN cart
WHERE NOT EXISTS (SELECT 1 FROM store__track_preview_embedding e
                       WHERE p.store__track_preview_id = e.store__track_preview_id
                         AND store__track_preview_embedding_type = ${model})
  AND store__track_preview_url IS NOT NULL
  AND NOT store__track_preview_missing
GROUP BY track_id, track_isrc`
      // language=
      .append(purchased ? ', cart_is_purchased' : '')
      .append(' ORDER BY ')
      .append(purchased ? 'cart_is_purchased NULLS LAST,' : '').append(sql`
BOOL_OR(cart_id IS NULL) DESC,
MAX(store__track_published) DESC
LIMIT ${batch_size || 20}`),
  )
}

module.exports.upsertTrackAnalysis = async (storeTrackPreviewId, model, embedding) => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`-- Upsert preview embeddings
    INSERT
    INTO store__track_preview_embedding ( store__track_preview_id, store__track_preview_embedding_type
                                        , store__track_preview_embedding)
    VALUES (${storeTrackPreviewId}, ${model}, ${embedding})
    ON CONFLICT (store__track_preview_id, store__track_preview_embedding_type) DO UPDATE
      SET store__track_preview_embedding            = ${embedding}
        , store__track_preview_embedding_updated_at = NOW()
    `,
  )
}

module.exports.markPreviewsMissing = async (storeTrackPreviewIds) =>
  await pg.queryAsync(
    // language=PostgreSQL
    sql`-- markPreviewsMissing
UPDATE store__track_preview
SET store__track_preview_missing = TRUE
WHERE store__track_preview_id = ANY (${storeTrackPreviewIds})
`,
  )

module.exports.insertWaveforms = (waveforms) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- Upsert preview waveform
INSERT INTO store__track_preview_waveform ( store__track_preview_id, store__track_preview_waveform_url
                                          , store__track_preview_waveform_start_ms
                                          , store__track_preview_waveform_end_ms)
SELECT id
     , waveform_url
     , waveform_start_ms
     , waveform_end_ms
FROM
  JSON_TO_RECORDSET(
      ${JSON.stringify(waveforms)}) AS t (
                           id BIGINT
                         , waveform_url TEXT
                         , waveform_start_ms INT
                         , waveform_end_ms INT)
  `,
  )

module.exports.queryTracksWithoutWaveform = (limit, stores) => {
  return pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- Query previews without waveform
SELECT store__track_id               AS id
     , store_name
     , store__track_preview_id       AS preview_id
     , store__track_preview_url      AS preview_url
     , store__track_preview_start_ms AS preview_start_ms
     , store__track_preview_end_ms   AS preview_end_ms
     , store__track_url              AS url
FROM
  store__track
  NATURAL JOIN store
  NATURAL LEFT JOIN store__track_preview
  NATURAL LEFT JOIN store__track_preview_waveform
WHERE store__track_preview_waveform_url IS NULL
  AND (${stores}::TEXT[] IS NULL OR store_name = ANY(${stores}))
  AND store__track_preview_missing IS NOT TRUE
  AND (store_name = 'Bandcamp' OR store__track_preview_url IS NOT NULL)
ORDER BY store__track_published DESC NULLS LAST
LIMIT ${limit}
    `,
  )
}

module.exports.setPreviewMissing = async (storeTrackPreviewId) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`UPDATE store__track_preview
SET store__track_preview_missing = TRUE
WHERE store__track_preview_id = ${storeTrackPreviewId}
`,
  )

module.exports.updateTrackDetailsForPreviewTracks = async (previews) => {
  const previewIds = previews.map(R.prop('id'))
  await BPromise.using(pg.getTransaction(), async (tx) => {
    await tx.queryAsync("SET statement_timeout TO '5min'")
    await tx.queryAsync(
      // language=PostgreSQL
      sql`-- updateTrackDetailsForPreviewTracks
      WITH tracks AS (SELECT track_id
                      FROM
                        track
                        NATURAL JOIN store__track
                        NATURAL JOIN store__track_preview
                      WHERE store__track_preview_id = ANY (${previewIds}))
      INSERT
      INTO track_details (track_id, track_details_updated, track_details)
        (SELECT track_id, NOW(), ROW_TO_JSON(track_details(ARRAY_AGG(track_id)))
         FROM
           tracks
         GROUP BY track_id
         LIMIT 1)
      ON CONFLICT ON CONSTRAINT track_details_track_id_key DO UPDATE
        SET track_details         = EXCLUDED.track_details
          , track_details_updated = NOW()
      `,
    )
  })

  return pg.queryRowsAsync(
    // language=PostgreSQL format=false
    sql`SELECT track_id
FROM
  track
  NATURAL JOIN store__track
  NATURAL JOIN store__track_preview
WHERE store__track_preview_id = ANY (${previewIds})
`,
  )
}

module.exports.queryNotificationAudioSamplesWithoutEmbedding = async (limit) => {
  return await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryNotificationAudioSamplesWithoutEmbedding
SELECT
  user_notification_audio_sample_id AS id,
  meta_account_user_id AS "userId",
  user_notification_audio_sample_url AS url,
  user_notification_audio_sample_object_key AS "objectKey",
  user_notification_audio_sample_file_size AS "fileSize",
  user_notification_audio_sample_file_type AS "fileType",
  user_notification_audio_sample_filename AS filename,
  user_notification_audio_sample_created_at AS "createdAt"
FROM user_notification_audio_sample
  NATURAL LEFT JOIN user_notification_audio_sample_embedding
WHERE user_notification_audio_sample_embedding.user_notification_audio_sample_id IS NULL
ORDER BY user_notification_audio_sample_created_at DESC
LIMIT ${limit || 100}
    `,
  )
}

module.exports.upsertNotificationAudioSampleEmbedding = async (sampleId, model, embedding) => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`-- Upsert audio sample embeddings
    INSERT
    INTO user_notification_audio_sample_embedding (
      user_notification_audio_sample_id,
      user_notification_audio_sample_embedding_type,
      user_notification_audio_sample_embedding
    )
    VALUES (${sampleId}, ${model}, ${embedding})
    ON CONFLICT (user_notification_audio_sample_id, user_notification_audio_sample_embedding_type) DO UPDATE
      SET user_notification_audio_sample_embedding = ${embedding}
        , user_notification_audio_sample_embedding_updated_at = NOW()
    `,
  )
}

module.exports.queryPreviewsWithoutFingerprint = async (limit) => {
  return await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryPreviewsWithoutFingerprint
SELECT
  store__track_preview_id AS "preview_id",
  store__track_preview_url AS url,
  store__track_id AS "store_track_id"
FROM store__track_preview
  NATURAL LEFT JOIN store__track_preview_fingerprint_meta
WHERE store__track_preview_fingerprint_meta.store__track_preview_id IS NULL
  AND store__track_preview_url IS NOT NULL
  AND NOT store__track_preview_missing
ORDER BY store__track_preview_id DESC
LIMIT ${limit || 100}
    `,
  )
}

module.exports.upsertPreviewFingerprints = async (previewId, fingerprints) => {
  await BPromise.using(pg.getTransaction(), async (tx) => {
    await tx.queryAsync(
      // language=PostgreSQL
      sql`-- Delete existing fingerprints for this preview
      DELETE FROM store__track_preview_fingerprint
      WHERE store__track_preview_id = ${previewId}
      `,
    )

    if (fingerprints && fingerprints.length > 0) {
      const fingerprintValues = fingerprints.map((fp) => ({
        preview_id: previewId,
        hash: fp.hash || fp.hash_value || 0,
        position: fp.position || fp.time || 0.0,
        f1: fp.f1 || null,
      }))

      await tx.queryAsync(
        // language=PostgreSQL
        sql`-- Insert fingerprints
        INSERT INTO store__track_preview_fingerprint (
          store__track_preview_id,
          store__track_preview_fingerprint_hash,
          store__track_preview_fingerprint_position,
          store__track_preview_fingerprint_frequency_bin
        )
        SELECT
          rec.preview_id::BIGINT,
          rec.hash::BIGINT,
          rec.position::FLOAT,
          CASE WHEN rec.f1 IS NULL OR rec.f1 = 'null' THEN NULL ELSE rec.f1::INTEGER END
        FROM json_to_recordset(${JSON.stringify(fingerprintValues)}::json) AS rec (preview_id TEXT, hash TEXT, position TEXT, f1 TEXT)
        `,
      )

      await tx.queryAsync(
        // language=PostgreSQL
        sql`-- Upsert fingerprint metadata
        INSERT INTO store__track_preview_fingerprint_meta (
          store__track_preview_id,
          store__track_preview_fingerprint_count,
          store__track_preview_fingerprint_extracted_at
        )
        VALUES (${previewId}, ${fingerprints.length}, NOW())
        ON CONFLICT (store__track_preview_id) DO UPDATE
          SET store__track_preview_fingerprint_count = ${fingerprints.length}
            , store__track_preview_fingerprint_extracted_at = NOW()
        `,
      )
    }
  })
}

module.exports.queryAudioSamplesWithoutFingerprint = async (limit) => {
  return await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryAudioSamplesWithoutFingerprint
SELECT
  user_notification_audio_sample_id AS id,
  meta_account_user_id AS "userId",
  user_notification_audio_sample_url AS url,
  user_notification_audio_sample_object_key AS "objectKey",
  user_notification_audio_sample_file_size AS "fileSize",
  user_notification_audio_sample_file_type AS "fileType",
  user_notification_audio_sample_filename AS filename,
  user_notification_audio_sample_created_at AS "createdAt"
FROM user_notification_audio_sample
  NATURAL LEFT JOIN user_notification_audio_sample_fingerprint_meta
WHERE user_notification_audio_sample_fingerprint_meta.user_notification_audio_sample_id IS NULL
ORDER BY user_notification_audio_sample_created_at DESC
LIMIT ${limit || 100}
    `,
  )
}

module.exports.upsertAudioSampleFingerprints = async (sampleId, fingerprints) => {
  await BPromise.using(pg.getTransaction(), async (tx) => {
    await tx.queryAsync(
      // language=PostgreSQL
      sql`-- Delete existing fingerprints for this sample
      DELETE FROM user_notification_audio_sample_fingerprint
      WHERE user_notification_audio_sample_id = ${sampleId}
      `,
    )

    if (fingerprints && fingerprints.length > 0) {
      const fingerprintValues = fingerprints.map((fp) => ({
        sample_id: sampleId,
        hash: fp.hash || fp.hash_value || 0,
        position: fp.position || fp.time || 0.0,
        f1: fp.f1 || null,
      }))

      await tx.queryAsync(
        // language=PostgreSQL
        sql`-- Insert fingerprints
        INSERT INTO user_notification_audio_sample_fingerprint (
          user_notification_audio_sample_id,
          user_notification_audio_sample_fingerprint_hash,
          user_notification_audio_sample_fingerprint_position,
          user_notification_audio_sample_fingerprint_frequency_bin
        )
        SELECT
          rec.sample_id::BIGINT,
          rec.hash::BIGINT,
          rec.position::FLOAT,
          CASE WHEN rec.f1 IS NULL OR rec.f1 = 'null' THEN NULL ELSE rec.f1::INTEGER END
        FROM json_to_recordset(${JSON.stringify(fingerprintValues)}::json) AS rec (sample_id TEXT, hash TEXT, position TEXT, f1 TEXT)
        `,
      )

      await tx.queryAsync(
        // language=PostgreSQL
        sql`-- Upsert fingerprint metadata
        INSERT INTO user_notification_audio_sample_fingerprint_meta (
          user_notification_audio_sample_id,
          user_notification_audio_sample_fingerprint_count,
          user_notification_audio_sample_fingerprint_extracted_at
        )
        VALUES (${sampleId}, ${fingerprints.length}, NOW())
        ON CONFLICT (user_notification_audio_sample_id) DO UPDATE
          SET user_notification_audio_sample_fingerprint_count = ${fingerprints.length}
            , user_notification_audio_sample_fingerprint_extracted_at = NOW()
        `,
      )
    }
  })
}

module.exports.getSuspectedDuplicates = async (type) => {
  if (type === 'artist') {
    return await pg.queryRowsAsync(sql`
      SELECT suspected_duplicate_artist_id AS id,
             a1.artist_id AS id1, a1.artist_name AS name1,
             a2.artist_id AS id2, a2.artist_name AS name2
      FROM suspected_duplicate_artist
      JOIN artist a1 ON artist_id_1 = a1.artist_id
      JOIN artist a2 ON artist_id_2 = a2.artist_id
      WHERE suspected_duplicate_artist_status = 'new'
    `)
  } else if (type === 'track') {
    return await pg.queryRowsAsync(sql`
      SELECT suspected_duplicate_track_id AS id,
             t1.track_id AS id1, t1.track_title AS title1, t1.track_version AS version1,
             t2.track_id AS id2, t2.track_title AS title2, t2.track_version AS version2,
             (SELECT JSON_AGG(JSON_BUILD_OBJECT('name', artist_name, 'role', track__artist_role))
              FROM track__artist NATURAL JOIN artist WHERE track_id = t1.track_id) AS artists1,
             (SELECT JSON_AGG(JSON_BUILD_OBJECT('name', artist_name, 'role', track__artist_role))
              FROM track__artist NATURAL JOIN artist WHERE track_id = t2.track_id) AS artists2
      FROM suspected_duplicate_track
      JOIN track t1 ON track_id_1 = t1.track_id
      JOIN track t2 ON track_id_2 = t2.track_id
      WHERE suspected_duplicate_track_status = 'new'
    `)
  } else if (type === 'release') {
    return await pg.queryRowsAsync(sql`
      SELECT suspected_duplicate_release_id AS id,
             r1.release_id AS id1, r1.release_name AS name1,
             r2.release_id AS id2, r2.release_name AS name2,
             (SELECT JSON_AGG(artist_name) FROM release__track NATURAL JOIN track__artist NATURAL JOIN artist WHERE release_id = r1.release_id) AS artists1,
             (SELECT JSON_AGG(artist_name) FROM release__track NATURAL JOIN track__artist NATURAL JOIN artist WHERE release_id = r2.release_id) AS artists2
      FROM suspected_duplicate_release
      JOIN release r1 ON release_id_1 = r1.release_id
      JOIN release r2 ON release_id_2 = r2.release_id
      WHERE suspected_duplicate_release_status = 'new'
    `)
  }
}

module.exports.mergeDuplicate = async (type, keptId, deletedId) => {
  const functionName = type === 'artist' ? 'merge_artists' : type === 'track' ? 'merge_tracks' : 'merge_releases'
  await pg.queryAsync(`SELECT ${functionName}($1, $2)`, [keptId, deletedId])

  const cacheTable = `suspected_duplicate_${type}`
  const id1 = `${type}_id_1`
  const id2 = `${type}_id_2`
  const status = `suspected_duplicate_${type}_status`

  await pg.queryAsync(`
    UPDATE ${cacheTable}
    SET ${status} = 'merged'
    WHERE (${id1} = $1 AND ${id2} = $2) OR (${id1} = $2 AND ${id2} = $1)
  `, [keptId, deletedId])
}

module.exports.ignoreDuplicate = async (type, id1, id2) => {
  const cacheTable = `suspected_duplicate_${type}`
  const col1 = `${type}_id_1`
  const col2 = `${type}_id_2`
  const status = `suspected_duplicate_${type}_status`

  await pg.queryAsync(`
    UPDATE ${cacheTable}
    SET ${status} = 'ignored'
    WHERE ${col1} = $1 AND ${col2} = $2
  `, [id1, id2])
}

module.exports.findExactMatchForSample = async (sampleId, threshold = 0.5) => {
  return await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- findExactMatchForSample
WITH sample_hashes AS (
  SELECT DISTINCT user_notification_audio_sample_fingerprint_hash
  FROM user_notification_audio_sample_fingerprint
  WHERE user_notification_audio_sample_id = ${sampleId}
),
preview_matches AS (
  SELECT
    stp.store__track_preview_id,
    stp.store__track_id,
    COUNT(DISTINCT stpf.store__track_preview_fingerprint_hash) AS matching_hashes,
    (SELECT COUNT(*) FROM sample_hashes) AS sample_hash_count
  FROM store__track_preview_fingerprint stpf
    NATURAL JOIN store__track_preview stp
    INNER JOIN sample_hashes sh ON stpf.store__track_preview_fingerprint_hash = sh.user_notification_audio_sample_fingerprint_hash
  GROUP BY stp.store__track_preview_id, stp.store__track_id
  HAVING COUNT(DISTINCT stpf.store__track_preview_fingerprint_hash)::FLOAT /
         NULLIF((SELECT COUNT(*) FROM sample_hashes), 0) >= ${threshold}
)
SELECT
  pm.store__track_preview_id,
  pm.store__track_id,
  pm.matching_hashes,
  pm.sample_hash_count,
  (pm.matching_hashes::FLOAT / NULLIF(pm.sample_hash_count, 0)) AS match_score,
  st.track_id
FROM preview_matches pm
  NATURAL JOIN store__track st
ORDER BY match_score DESC, matching_hashes DESC
LIMIT 10
    `,
  )
}

const MISLABELED_ENTITY_TYPES = ['artist', 'label']

// Read the cached, page-confirmed mislabeled entities for the admin UI. Counts
// are fetched in a second pass so the cache stays free of aggregates that go
// stale as tracks are reassigned.
module.exports.getMislabeledEntities = async (type) => {
  if (!MISLABELED_ENTITY_TYPES.includes(type)) throw new Error(`Unsupported entity type: ${type}`)

  const cached = await getCachedMislabeled(type)
  if (cached.length === 0) return []

  const ids = cached.map((r) => r.id)
  if (type === 'artist') {
    const counts = await pg.queryRowsAsync(sql`-- getMislabeledEntities artist counts
      SELECT ta.artist_id                 AS id
           , COUNT(DISTINCT ta.track_id)   AS "trackCount"
           , COUNT(DISTINCT rt.release_id) AS "releaseCount"
      FROM
        track__artist ta
        LEFT JOIN release__track rt ON rt.track_id = ta.track_id
      WHERE ta.artist_id = ANY (${ids})
      GROUP BY ta.artist_id`)
    return mergeCounts(cached, counts)
  }

  const counts = await pg.queryRowsAsync(sql`-- getMislabeledEntities label counts
    SELECT tl.label_id              AS id
         , COUNT(DISTINCT tl.track_id) AS "trackCount"
    FROM track__label tl
    WHERE tl.label_id = ANY (${ids})
    GROUP BY tl.label_id`)
  return mergeCounts(cached, counts)
}

module.exports.ignoreMislabeledEntity = async (type, id) => {
  if (!MISLABELED_ENTITY_TYPES.includes(type)) throw new Error(`Unsupported entity type: ${type}`)
  await ignoreCachedMislabeled(type, parseInt(id, 10))
}

module.exports.flagMislabeledEntity = async (type, id) => {
  if (!MISLABELED_ENTITY_TYPES.includes(type)) throw new Error(`Unsupported entity type: ${type}`)
  const parsedId = parseInt(id, 10)
  if (Number.isNaN(parsedId)) throw new Error('Invalid id')
  await flagMislabeledById(type, parsedId)
}

// Re-label a Bandcamp artist that is actually a label: find/create the label
// (by name, linking the artist's Bandcamp store URL), move every track credited
// to the artist onto the label, drop the artist's bogus credit (leaving any
// other artist credits intact), migrate the artist's followers into followers
// of the label, then retire the now-empty artist and clear its mislabeled flag.
// Returns the new label id and whether the artist was deleted.
module.exports.convertArtistToLabel = async (id) => {
  const parsedId = parseInt(id, 10)
  if (Number.isNaN(parsedId)) throw new Error('Invalid id')

  return BPromise.using(pg.getTransaction(), async (tx) => {
    const [artist] = await tx.queryRowsAsync(sql`-- convertArtistToLabel load artist
      SELECT a.artist_name             AS name
           , sa.store__artist_store_id AS "storeId"
           , sa.store__artist_url      AS url
      FROM
        artist a
        LEFT JOIN store__artist sa ON sa.artist_id = a.artist_id
          AND sa.store_id = (SELECT store_id FROM store WHERE store_url = ${BANDCAMP_STORE_URL})
      WHERE a.artist_id = ${parsedId}`)
    if (!artist) throw new Error(`Artist ${parsedId} not found`)

    let labelId
    let storeLabelId = null
    if (artist.url && artist.storeId) {
      ;({ labelId, storeLabelId } = await ensureLabelExists(
        tx,
        BANDCAMP_STORE_URL,
        { id: artist.storeId, url: artist.url, name: artist.name },
        null,
      ))
    } else {
      const [existing] = await tx.queryRowsAsync(sql`-- convertArtistToLabel find label by name
        SELECT label_id AS id FROM label WHERE LOWER(label_name) = LOWER(${artist.name})`)
      labelId =
        existing?.id ??
        (
          await tx.queryRowsAsync(sql`-- convertArtistToLabel create label
            INSERT INTO label (label_name) VALUES (${artist.name}) RETURNING label_id AS id`)
        )[0].id
    }

    await tx.queryAsync(sql`-- convertArtistToLabel add label credits
      INSERT INTO track__label (track_id, label_id)
      SELECT ta.track_id, ${labelId}
      FROM track__artist ta
      WHERE ta.artist_id = ${parsedId}
      ON CONFLICT ON CONSTRAINT track__label_track_id_label_id_key DO NOTHING`)

    await tx.queryAsync(sql`-- convertArtistToLabel drop artist credits
      DELETE FROM track__artist WHERE artist_id = ${parsedId}`)

    await tx.queryAsync(sql`-- convertArtistToLabel clear flag
      DELETE FROM bandcamp_mislabeled_artist WHERE artist_id = ${parsedId}`)

    await tx.queryAsync(sql`-- convertArtistToLabel clear artist url
      UPDATE store__artist
      SET store__artist_url = NULL, store__artist_store_id = NULL
      WHERE artist_id = ${parsedId}
        AND store_id = (SELECT store_id FROM store WHERE store_url = ${BANDCAMP_STORE_URL})`)

    // Carry the artist's followers over to the label. Each follower of any of
    // the artist's store watches becomes a follower of the label's Bandcamp
    // watch (created on demand). The artist watch rows are dropped with the
    // artist below via ON DELETE CASCADE.
    const [{ followerCount }] = await tx.queryRowsAsync(sql`-- convertArtistToLabel follower count
      SELECT COUNT(DISTINCT sawu.meta_account_user_id)::int AS "followerCount"
      FROM
        store__artist_watch__user sawu
        JOIN store__artist_watch saw ON saw.store__artist_watch_id = sawu.store__artist_watch_id
        JOIN store__artist sa ON sa.store__artist_id = saw.store__artist_id
      WHERE sa.artist_id = ${parsedId}`)

    let followsMigrated = false
    if (followerCount > 0 && storeLabelId) {
      await tx.queryAsync(sql`-- convertArtistToLabel ensure label watch
        INSERT INTO store__label_watch (store__label_id) VALUES (${storeLabelId})
        ON CONFLICT (store__label_id) DO NOTHING`)
      const [{ labelWatchId }] = await tx.queryRowsAsync(sql`-- convertArtistToLabel label watch id
        SELECT store__label_watch_id AS "labelWatchId"
        FROM store__label_watch WHERE store__label_id = ${storeLabelId}`)
      await tx.queryAsync(sql`-- convertArtistToLabel migrate followers
        INSERT INTO store__label_watch__user (store__label_watch_id, meta_account_user_id)
        SELECT ${labelWatchId}, sawu.meta_account_user_id
        FROM
          store__artist_watch__user sawu
          JOIN store__artist_watch saw ON saw.store__artist_watch_id = sawu.store__artist_watch_id
          JOIN store__artist sa ON sa.store__artist_id = saw.store__artist_id
        WHERE sa.artist_id = ${parsedId}
        ON CONFLICT (store__label_watch_id, meta_account_user_id) DO NOTHING`)
      followsMigrated = true
    }

    // Retire the artist once it has nothing left: all tracks were re-credited
    // above, so the only thing that can keep it alive is followers we could not
    // move (no Bandcamp label store presence to attach the watch to).
    if (followerCount > 0 && !followsMigrated) return { labelId, deleted: false }

    await tx.queryAsync(sql`DELETE FROM user__artist_ignore WHERE artist_id = ${parsedId}`)
    await tx.queryAsync(sql`DELETE FROM user__artist__label_ignore WHERE artist_id = ${parsedId}`)
    await tx.queryAsync(sql`DELETE FROM artist__genre WHERE artist_id = ${parsedId}`)
    await tx.queryAsync(sql`DELETE FROM store__artist WHERE artist_id = ${parsedId}`)
    await tx.queryAsync(sql`DELETE FROM artist WHERE artist_id = ${parsedId}`)
    return { labelId, deleted: true }
  })
}

const mergeCounts = (flagged, counts) => {
  const byId = new Map(counts.map((c) => [c.id, c]))
  return flagged.map((row) => ({
    ...row,
    trackCount: Number(byId.get(row.id)?.trackCount || 0),
    releaseCount: Number(byId.get(row.id)?.releaseCount || 0),
  }))
}

// Tracks currently attributed to a mislabeled artist/label, with their full
// artist credits so an admin can see what each track should really be.
module.exports.getMislabeledEntityTracks = async (type, id) => {
  if (!MISLABELED_ENTITY_TYPES.includes(type)) throw new Error(`Unsupported entity type: ${type}`)
  const parsedId = parseInt(id, 10)
  if (Number.isNaN(parsedId)) throw new Error('Invalid id')

  const artists = sql`(SELECT JSON_AGG(JSON_BUILD_OBJECT('name', artist_name, 'role', track__artist_role))
                       FROM track__artist NATURAL JOIN artist WHERE track_id = t.track_id) AS artists`

  if (type === 'artist') {
    return pg.queryRowsAsync(
      sql`-- getMislabeledEntityTracks artist
      SELECT DISTINCT ON (t.track_id)
             t.track_id            AS id
           , t.track_title         AS title
           , t.track_version       AS version
           , ta.track__artist_role AS role
           , r.release_id          AS "releaseId"
           , r.release_name        AS "releaseName"
           , `
        .append(artists)
        .append(sql`
      FROM
        track__artist ta
        JOIN track t ON t.track_id = ta.track_id
        LEFT JOIN release__track rt ON rt.track_id = t.track_id
        LEFT JOIN release r ON r.release_id = rt.release_id
      WHERE ta.artist_id = ${parsedId}
      ORDER BY t.track_id, r.release_name`),
    )
  }

  return pg.queryRowsAsync(
    sql`-- getMislabeledEntityTracks label
    SELECT DISTINCT ON (t.track_id)
           t.track_id     AS id
         , t.track_title  AS title
         , t.track_version AS version
         , NULL           AS role
         , r.release_id   AS "releaseId"
         , r.release_name AS "releaseName"
         , `
      .append(artists)
      .append(sql`
    FROM
      track__label tl
      JOIN track t ON t.track_id = tl.track_id
      LEFT JOIN release__track rt ON rt.track_id = t.track_id
      LEFT JOIN release r ON r.release_id = rt.release_id
    WHERE tl.label_id = ${parsedId}
    ORDER BY t.track_id, r.release_name`),
  )
}

// Move one track's link from a mislabeled source entity to the correct target.
// Source and target may be different types (e.g. a label-as-artist track moved
// onto a label): we add the target link and drop the source link.
module.exports.reassignTrack = async ({ sourceType, sourceId, targetType, targetId, trackId, role }) => {
  if (!MISLABELED_ENTITY_TYPES.includes(sourceType) || !MISLABELED_ENTITY_TYPES.includes(targetType)) {
    throw new Error('Invalid entity type')
  }
  const src = parseInt(sourceId, 10)
  const tgt = parseInt(targetId, 10)
  const track = parseInt(trackId, 10)
  if ([src, tgt, track].some((n) => Number.isNaN(n))) throw new Error('Invalid id')
  if (sourceType === targetType && src === tgt) throw new Error('Source and target are the same entity')

  return BPromise.using(pg.getTransaction(), async (tx) => {
    if (targetType === 'artist') {
      await tx.queryAsync(sql`-- reassignTrack add artist
        INSERT INTO track__artist (track_id, artist_id, track__artist_role)
        VALUES (${track}, ${tgt}, ${role || 'author'})
        ON CONFLICT ON CONSTRAINT track__artist_track_id_artist_id_track__artist_role_key DO NOTHING`)
    } else {
      await tx.queryAsync(sql`-- reassignTrack add label
        INSERT INTO track__label (track_id, label_id)
        VALUES (${track}, ${tgt})
        ON CONFLICT ON CONSTRAINT track__label_track_id_label_id_key DO NOTHING`)
    }

    if (sourceType === 'artist') {
      if (role) {
        await tx.queryAsync(sql`-- reassignTrack remove artist (role)
          DELETE FROM track__artist WHERE track_id = ${track} AND artist_id = ${src} AND track__artist_role = ${role}`)
      } else {
        await tx.queryAsync(sql`-- reassignTrack remove artist
          DELETE FROM track__artist WHERE track_id = ${track} AND artist_id = ${src}`)
      }
    } else {
      await tx.queryAsync(sql`-- reassignTrack remove label
        DELETE FROM track__label WHERE track_id = ${track} AND label_id = ${src}`)
    }
  })
}

// After reassigning, neutralise the source: clear the bogus Bandcamp store URL
// (artists only — the label URL is NOT NULL) so it can't re-absorb, then delete
// it if nothing references it anymore.
module.exports.cleanupMislabeledSource = async (type, id) => {
  if (!MISLABELED_ENTITY_TYPES.includes(type)) throw new Error(`Unsupported entity type: ${type}`)
  const parsedId = parseInt(id, 10)
  if (Number.isNaN(parsedId)) throw new Error('Invalid id')

  if (type === 'artist') {
    await pg.queryAsync(sql`-- cleanupMislabeledSource clear artist url
      UPDATE store__artist
      SET store__artist_url = NULL, store__artist_store_id = NULL
      WHERE artist_id = ${parsedId}
        AND store_id = (SELECT store_id FROM store WHERE store_url = ${BANDCAMP_STORE_URL})`)

    const [{ empty }] = await pg.queryRowsAsync(sql`-- cleanupMislabeledSource artist empty?
      SELECT NOT EXISTS (SELECT 1 FROM track__artist WHERE artist_id = ${parsedId})
         AND NOT EXISTS (SELECT 1
                         FROM store__artist_watch saw
                           JOIN store__artist sa ON sa.store__artist_id = saw.store__artist_id
                         WHERE sa.artist_id = ${parsedId}) AS empty`)
    if (!empty) return { deleted: false }
    try {
      await BPromise.using(pg.getTransaction(), async (tx) => {
        await tx.queryAsync(sql`DELETE FROM user__artist_ignore WHERE artist_id = ${parsedId}`)
        await tx.queryAsync(sql`DELETE FROM user__artist__label_ignore WHERE artist_id = ${parsedId}`)
        await tx.queryAsync(sql`DELETE FROM artist__genre WHERE artist_id = ${parsedId}`)
        await tx.queryAsync(sql`DELETE FROM store__artist WHERE artist_id = ${parsedId}`)
        await tx.queryAsync(sql`DELETE FROM artist WHERE artist_id = ${parsedId}`)
      })
      return { deleted: true }
    } catch (e) {
      logger.warn(`Could not delete mislabeled artist ${parsedId}: ${e.message}`)
      return { deleted: false }
    }
  }

  const [{ empty }] = await pg.queryRowsAsync(sql`-- cleanupMislabeledSource label empty?
    SELECT NOT EXISTS (SELECT 1 FROM track__label WHERE label_id = ${parsedId})
       AND NOT EXISTS (SELECT 1
                       FROM store__label_watch slw
                         JOIN store__label sl ON sl.store__label_id = slw.store__label_id
                       WHERE sl.label_id = ${parsedId}) AS empty`)
  if (!empty) return { deleted: false }
  try {
    await BPromise.using(pg.getTransaction(), async (tx) => {
      await tx.queryAsync(sql`DELETE FROM store__label WHERE label_id = ${parsedId}`)
      await tx.queryAsync(sql`DELETE FROM label WHERE label_id = ${parsedId}`)
    })
    return { deleted: true }
  } catch (e) {
    logger.warn(`Could not delete mislabeled label ${parsedId}: ${e.message}`)
    return { deleted: false }
  }
}
