const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

// Tempo-aware two-stage Panako matcher shared by findExactMatchForSample
// (stored user audio samples) and the offline DJ set tools
// (scripts/dj-set/*, in-memory fingerprints).
//
// Stage 1 picks candidate previews by distinct-hash overlap. Stage 2 scores
// each candidate by temporal coherence: a sample that plays the preview at
// tempo factor `a` (a > 1 = faster) maps every matched pair onto the line
// preview_pos = a · sample_pos + b, so the score is the largest number of
// pairs sharing one (a, b-bucket) cell over a grid of tempo factors. Panako
// hashes survive ±8 % time-stretch and speed changes; only the slope-1
// assumption of the old scorer lost those matches.

// The finest grid step. Below it the extra hypotheses only add noise: a
// 0.25 % error over a 4 minute sample is 0.6 s, about one bucket.
const MIN_TEMPO_STEP = 0.0025

// Tempo factors to test, symmetric around and always including 1. The step
// is bucket / span so that within one hypothesis the drift across the whole
// sample stays under one bucket.
const tempoFactorGrid = ({ maxDeviation, bucketSeconds, spanSeconds }) => {
  if (!maxDeviation || maxDeviation <= 0) return [1]
  const idealStep = spanSeconds > 0 ? bucketSeconds / spanSeconds : maxDeviation
  const step = Math.min(maxDeviation, Math.max(MIN_TEMPO_STEP, idealStep))
  const stepsPerSide = Math.ceil(maxDeviation / step - 1e-9)
  const exactStep = maxDeviation / stepsPerSide
  const grid = []
  for (let i = -stepsPerSide; i <= stepsPerSide; i++) {
    grid.push(Number((1 + i * exactStep).toFixed(6)))
  }
  return grid
}

// Sample-side fingerprints as an SQL fragment yielding (hash, position).
const sampleFingerprintsQuery = (sample) => {
  if (sample.sampleId !== undefined) {
    return sql`
      SELECT user_notification_audio_sample_fingerprint_hash AS hash
           , user_notification_audio_sample_fingerprint_position AS position
      FROM user_notification_audio_sample_fingerprint
      WHERE user_notification_audio_sample_id = ${sample.sampleId}`
  }
  // Hashes travel as strings: Panako hashes can exceed 2^53.
  return sql`
      SELECT hash, position
      FROM unnest(${sample.hashes.map(String)}::BIGINT[], ${sample.positions}::FLOAT8[]) AS f (hash, position)`
}

const sampleStats = async (sample, db) => {
  if (sample.sampleId === undefined) {
    const { hashes, positions } = sample
    let min = Infinity
    let max = -Infinity
    for (const p of positions) {
      if (p < min) min = p
      if (p > max) max = p
    }
    return {
      sampleHashCount: new Set(hashes.map(String)).size,
      spanSeconds: positions.length > 0 ? max - min : 0,
    }
  }
  const [row] = await db.queryRowsAsync(
    // language=PostgreSQL
    sql`-- matchFingerprints sample stats
SELECT COUNT(DISTINCT user_notification_audio_sample_fingerprint_hash)::INTEGER AS sample_hash_count
     , COALESCE(MAX(user_notification_audio_sample_fingerprint_position)
                  - MIN(user_notification_audio_sample_fingerprint_position), 0)::FLOAT AS span_seconds
FROM user_notification_audio_sample_fingerprint
WHERE user_notification_audio_sample_id = ${sample.sampleId}
    `,
  )
  return { sampleHashCount: row.sample_hash_count, spanSeconds: row.span_seconds }
}

// sample: { sampleId } or { hashes: [], positions: [] } (positions in seconds).
// Returns { rows, sampleHashCount, tempoFactorCount }. Rows are ordered by
// match_score and carry the peak's tempo factor and offset.
module.exports.matchFingerprints = async (
  sample,
  { threshold, bucketSeconds, peakBucketMin, maxTempoDeviation, candidateLimit = 100, resultLimit = 10, db = pg },
) => {
  const { sampleHashCount, spanSeconds } = await sampleStats(sample, db)
  const grid = tempoFactorGrid({ maxDeviation: maxTempoDeviation, bucketSeconds, spanSeconds })
  if (sampleHashCount === 0) return { rows: [], sampleHashCount, tempoFactorCount: grid.length }

  const query = sql`-- matchFingerprints (two-stage, tempo-aware)
WITH sample_fingerprints AS MATERIALIZED (`
    .append(sampleFingerprintsQuery(sample))
    .append(
      sql`
),
sample_hashes AS (
  SELECT DISTINCT hash FROM sample_fingerprints
),
candidates AS (
  -- Stage 1: distinct-hash overlap above the threshold. The LIMIT keeps the
  -- Stage 2 join tractable on a large preview corpus.
  SELECT
    stpf.store__track_preview_id,
    COUNT(DISTINCT stpf.store__track_preview_fingerprint_hash)::INTEGER AS matching_hashes
  FROM store__track_preview_fingerprint stpf
    INNER JOIN sample_hashes sh
      ON stpf.store__track_preview_fingerprint_hash = sh.hash
  GROUP BY stpf.store__track_preview_id
  HAVING COUNT(DISTINCT stpf.store__track_preview_fingerprint_hash)::FLOAT / ${sampleHashCount} >= ${threshold}
  ORDER BY matching_hashes DESC
  LIMIT ${candidateLimit}
),
matched_positions AS (
  -- Every (sample_pos, preview_pos) pair sharing a hash, per candidate.
  SELECT
    c.store__track_preview_id,
    sf.position AS sample_position,
    pf.store__track_preview_fingerprint_position AS preview_position
  FROM candidates c
    INNER JOIN store__track_preview_fingerprint pf
      ON pf.store__track_preview_id = c.store__track_preview_id
    INNER JOIN sample_fingerprints sf
      ON sf.hash = pf.store__track_preview_fingerprint_hash
),
bucket_counts AS (
  -- Stage 2: for every tempo factor a, bucket b = preview_pos − a · sample_pos.
  SELECT
    mp.store__track_preview_id,
    g.tempo_factor,
    ROUND((mp.preview_position - g.tempo_factor * mp.sample_position) / ${bucketSeconds}::FLOAT) AS offset_bucket,
    COUNT(*)::INTEGER AS bucket_count
  FROM matched_positions mp
    CROSS JOIN unnest(${grid}::FLOAT8[]) AS g (tempo_factor)
  GROUP BY 1, 2, 3
),
peak_per_preview AS (
  -- Ties prefer the tempo factor closest to 1, then the earliest offset.
  SELECT DISTINCT ON (store__track_preview_id)
    store__track_preview_id,
    tempo_factor AS peak_tempo_factor,
    offset_bucket * ${bucketSeconds}::FLOAT AS peak_offset_seconds,
    bucket_count AS peak_bucket_count
  FROM bucket_counts
  ORDER BY store__track_preview_id, bucket_count DESC, ABS(tempo_factor - 1) ASC, offset_bucket ASC
)
SELECT
  ppp.store__track_preview_id,
  stp.store__track_id,
  st.track_id,
  c.matching_hashes,
  ${sampleHashCount}::INTEGER AS sample_hash_count,
  ppp.peak_offset_seconds::FLOAT AS peak_delta_t_seconds,
  ppp.peak_offset_seconds::FLOAT AS peak_offset_seconds,
  ppp.peak_tempo_factor::FLOAT AS peak_tempo_factor,
  ppp.peak_bucket_count AS match_score,
  (c.matching_hashes::FLOAT / ${sampleHashCount}) AS stage1_ratio
FROM peak_per_preview ppp
  INNER JOIN candidates c ON c.store__track_preview_id = ppp.store__track_preview_id
  INNER JOIN store__track_preview stp ON stp.store__track_preview_id = ppp.store__track_preview_id
  INNER JOIN store__track st ON st.store__track_id = stp.store__track_id
WHERE ppp.peak_bucket_count >= ${peakBucketMin}
ORDER BY match_score DESC, c.matching_hashes DESC
LIMIT ${resultLimit}
`,
    )

  const rows = await db.queryRowsAsync(query)
  return { rows, sampleHashCount, tempoFactorCount: grid.length }
}

module.exports.tempoFactorGrid = tempoFactorGrid
