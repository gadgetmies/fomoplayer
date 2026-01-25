const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const config = require('../../config')
const logger = require('fomoplayer_shared').logger(__filename)
const R = require('ramda')
const BPromise = require('bluebird')

module.exports.mergeTracks = async ({ trackToBeDeleted, trackToKeep }) => {
  await pg.queryAsync(sql`
-- Merge tracks
SELECT merge_tracks(${trackToBeDeleted}, ${trackToKeep});
  `)
}

module.exports.queryJobLinks = async () => {
  const [{ urls }] = await pg.queryRowsAsync(
    sql`-- queryJobLinks
SELECT STRING_AGG(${`<a href="${config.apiURL}/admin/jobs/`} || job_name || '/run">' || job_name || '</a>', '<br/>') AS urls
FROM job
      `,
  )
  return urls
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
