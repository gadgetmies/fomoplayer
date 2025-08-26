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
