const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const config = require('../../config')

const vectorPg = require('pg-using-bluebird')({
  dbUrl: process.env.VECTOR_DATABASE_URL,
  ssl: Boolean(process.env.DATABASE_USE_SSL)
    ? {
        rejectUnauthorized: !Boolean(process.env.DATABASE_SELF_SIGNED_CERT),
      }
    : false,
})

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

module.exports.queryNextTracksToAnalyse = async ({ key, batch_size }) => {
  const [{ track_ids }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- Query next tracks to analyse
SELECT DISTINCT ON (track_id)
    track_id
  , track_isrc
  , store__track_preview_url
FROM
    track
        NATURAL JOIN track_analysis
        NATURAL JOIN store__track_preview
WHERE
        track_id NOT IN (SELECT track_id FROM track_analysis WHERE track_analysis_key = ${key})
  AND   store__track_preview_url IS NOT NULL
LIMIT ${batch_size}
    `,
  )

  return track_ids
}

module.exports.upsertTrackAnalysis = async (trackId, model, embeddings) => {
  await vectorPg.queryAsync(
    // language=PostgreSQL
    sql`-- Upsert track embeddings
INSERT
INTO
    track_embedding (track_id, track_embedding_type, track_embedding_vector)
VALUES
    (${trackId}, ${model}, ${embeddings})
ON CONFLICT (track_id, track_embedding_type) DO UPDATE
    SET
        track_embedding_vector      = ${embeddings}
      , track_analysis_updated_at = NOW()
    `,
  )
}
