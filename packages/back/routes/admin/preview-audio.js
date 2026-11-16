const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const logger = require('fomoplayer_shared').logger(__filename)
const { STORAGE_ROUTE_PREFIX } = require('../shared/minio')

// The embedding type the search and cart similarity queries read: a preview needs one before its audio is released.
const PRODUCTION_EMBEDDING_TYPE = 'discogs_multi_embeddings-effnet-bs64-1'
// The stores whose previews the prefetchPreviewAudio job downloads. Spotify previews are not downloadable.
const PREFETCH_STORES = ['Bandcamp', 'Beatport']
// The waveform worker only asks for Bandcamp previews (analyser/waveform.py sends stores=Bandcamp), so only they
// wait for a waveform.
const WAVEFORM_STORES = ['Bandcamp']
const OBJECT_KEY_PREFIX = 'preview-audio/'
// A failed download is retried after this long, and the preview is marked missing after this many failures.
const RETRY_AFTER = '1 hour'
const MAX_FAILED_ATTEMPTS = 3

const audioUrl = (objectKey) => (objectKey ? `${STORAGE_ROUTE_PREFIX}${objectKey}` : null)

// True for a preview (aliased p, joined with store) that needs no more analysis: it is missing, or it has a
// fingerprint, a production embedding and, where the waveform worker makes one, a waveform.
const analysedCondition = () => sql`(
  p.store__track_preview_missing
  OR (EXISTS (SELECT 1 FROM store__track_preview_fingerprint_meta m
              WHERE m.store__track_preview_id = p.store__track_preview_id)
      AND EXISTS (SELECT 1 FROM store__track_preview_embedding e
                  WHERE e.store__track_preview_id = p.store__track_preview_id
                    AND e.store__track_preview_embedding_type = ${PRODUCTION_EMBEDDING_TYPE})
      AND (NOT s.store_name = ANY (${WAVEFORM_STORES})
           OR EXISTS (SELECT 1 FROM store__track_preview_waveform w
                      WHERE w.store__track_preview_id = p.store__track_preview_id
                        AND w.store__track_preview_waveform_url IS NOT NULL))))`

// Previews to download, newest first: not analysed, not stored, not waiting to retry a failure and not known to be
// larger than maxBytes. Bandcamp previews need the release page to look up their stream; the analyser defers those
// without one too.
const queryPreviewsToPrefetch = (limit, maxBytes) =>
  pg.queryRowsAsync(
    sql`-- queryPreviewsToPrefetch
SELECT *
FROM (SELECT p.store__track_preview_id AS preview_id
           , s.store_name
           , p.store__track_preview_url AS url
           , st.store__track_store_id AS store_track_id
           , (SELECT sr.store__release_url
              FROM release__track rt
                JOIN store__release sr ON sr.release_id = rt.release_id
              WHERE rt.track_id = st.track_id
                AND sr.store_id = s.store_id
              LIMIT 1) AS release_url
      FROM store__track_preview p
        JOIN store__track st ON st.store__track_id = p.store__track_id
        JOIN store s ON s.store_id = st.store_id
        LEFT JOIN store__track_preview_audio a ON a.store__track_preview_id = p.store__track_preview_id
      WHERE s.store_name = ANY (${PREFETCH_STORES})
        AND a.store__track_preview_audio_object_key IS NULL
        AND (a.store__track_preview_id IS NULL
             OR a.store__track_preview_audio_last_attempt_at < NOW() - ${RETRY_AFTER}::INTERVAL)
        -- A preview found too large keeps its size here; raising the limit lets it be downloaded again.
        AND (a.store__track_preview_audio_file_size IS NULL OR a.store__track_preview_audio_file_size <= ${maxBytes})
        AND (s.store_name = 'Bandcamp' OR p.store__track_preview_url IS NOT NULL)
        AND NOT `
      .append(analysedCondition())
      .append(
        sql`
      ORDER BY p.store__track_preview_id DESC) previews
WHERE store_name <> 'Bandcamp' OR release_url IS NOT NULL
LIMIT ${limit}`,
      ),
  )

const countStoredPreviewAudio = async () => {
  const [{ count }] = await pg.queryRowsAsync(
    sql`SELECT COUNT(*)::INT AS count FROM store__track_preview_audio
        WHERE store__track_preview_audio_object_key IS NOT NULL`,
  )
  return count
}

const recordStoredPreviewAudio = (previewId, objectKey, fileSize) =>
  pg.queryAsync(
    sql`-- recordStoredPreviewAudio
INSERT INTO store__track_preview_audio ( store__track_preview_id, store__track_preview_audio_object_key
                                       , store__track_preview_audio_file_size, store__track_preview_audio_stored_at
                                       , store__track_preview_audio_last_attempt_at)
VALUES (${previewId}, ${objectKey}, ${fileSize}, NOW(), NOW())
ON CONFLICT (store__track_preview_id) DO UPDATE
  SET store__track_preview_audio_object_key      = EXCLUDED.store__track_preview_audio_object_key
    , store__track_preview_audio_file_size       = EXCLUDED.store__track_preview_audio_file_size
    , store__track_preview_audio_stored_at       = NOW()
    , store__track_preview_audio_last_error      = NULL
    , store__track_preview_audio_last_attempt_at = NOW()`,
  )

// Returns the number of failed attempts so far, this one included.
const recordPreviewAudioFailure = async (previewId, error) => {
  const [{ attempts }] = await pg.queryRowsAsync(
    sql`-- recordPreviewAudioFailure
INSERT INTO store__track_preview_audio ( store__track_preview_id, store__track_preview_audio_failed_attempts
                                       , store__track_preview_audio_last_error)
VALUES (${previewId}, 1, ${error})
ON CONFLICT (store__track_preview_id) DO UPDATE
  SET store__track_preview_audio_failed_attempts = store__track_preview_audio.store__track_preview_audio_failed_attempts + 1
    , store__track_preview_audio_last_error      = EXCLUDED.store__track_preview_audio_last_error
    , store__track_preview_audio_last_attempt_at = NOW()
RETURNING store__track_preview_audio_failed_attempts AS attempts`,
  )
  return attempts
}

// Records that the preview's audio is larger than the job downloads, without counting it as a failed attempt: the
// preview is not marked missing (it still plays), only left out of prefetching while the limit is below its size.
const recordPreviewAudioTooLarge = (previewId, fileSize) =>
  pg.queryAsync(
    sql`-- recordPreviewAudioTooLarge
INSERT INTO store__track_preview_audio ( store__track_preview_id, store__track_preview_audio_file_size
                                       , store__track_preview_audio_last_error)
VALUES (${previewId}, ${fileSize}, 'Too large to prefetch')
ON CONFLICT (store__track_preview_id) DO UPDATE
  SET store__track_preview_audio_file_size       = EXCLUDED.store__track_preview_audio_file_size
    , store__track_preview_audio_last_error      = EXCLUDED.store__track_preview_audio_last_error
    , store__track_preview_audio_last_attempt_at = NOW()`,
  )

const isMissingObject = (error) => ['NoSuchKey', 'NotFound'].includes(error?.code)

// Removes the stored audio of the analysed previews among previewIds (all of them when null) and their rows. A file
// that cannot be removed keeps its row, so a later call tries again. Returns how many previews were released.
const releaseAnalysedPreviewAudio = async ({ client, bucketName, previewIds = null }) => {
  if (previewIds !== null && previewIds.length === 0) return 0
  const rows = await pg.queryRowsAsync(
    sql`-- releaseAnalysedPreviewAudio
SELECT a.store__track_preview_id AS preview_id, a.store__track_preview_audio_object_key AS object_key
FROM store__track_preview_audio a
  JOIN store__track_preview p ON p.store__track_preview_id = a.store__track_preview_id
  JOIN store__track st ON st.store__track_id = p.store__track_id
  JOIN store s ON s.store_id = st.store_id
WHERE (${previewIds}::BIGINT[] IS NULL OR a.store__track_preview_id = ANY (${previewIds}::BIGINT[]))
  AND `.append(analysedCondition()),
  )

  let released = 0
  for (const { preview_id, object_key } of rows) {
    if (object_key) {
      if (!client || !bucketName) continue
      try {
        await client.removeObject(bucketName, object_key)
      } catch (error) {
        if (!isMissingObject(error)) {
          logger.warn('Could not remove stored preview audio', { previewId: preview_id, error: error.message })
          continue
        }
      }
    }
    await pg.queryAsync(
      sql`DELETE FROM store__track_preview_audio
          WHERE store__track_preview_id = ${preview_id}
            AND store__track_preview_audio_object_key IS NOT DISTINCT FROM ${object_key}`,
    )
    released++
  }
  return released
}

module.exports = {
  PRODUCTION_EMBEDDING_TYPE,
  PREFETCH_STORES,
  OBJECT_KEY_PREFIX,
  MAX_FAILED_ATTEMPTS,
  audioUrl,
  queryPreviewsToPrefetch,
  countStoredPreviewAudio,
  recordStoredPreviewAudio,
  recordPreviewAudioFailure,
  recordPreviewAudioTooLarge,
  releaseAnalysedPreviewAudio,
}
