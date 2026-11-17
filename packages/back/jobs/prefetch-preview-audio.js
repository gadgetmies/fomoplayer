const crypto = require('crypto')
const { getMinioClient, getBucketName } = require('../routes/shared/minio')
const bandcampApi = require('../routes/stores/bandcamp/bandcamp-api')
const {
  queryStoredStreamUrl,
  refreshReleaseStreamUrls,
  findStreamUrl,
} = require('../routes/stores/bandcamp/stream-urls')
const { markPreviewsMissing } = require('../routes/admin/db')
const {
  OBJECT_KEY_PREFIX,
  MAX_FAILED_ATTEMPTS,
  queryPreviewsToPrefetch,
  countStoredPreviewAudio,
  recordStoredPreviewAudio,
  recordPreviewAudioFailure,
  recordPreviewAudioTooLarge,
  releaseAnalysedPreviewAudio,
} = require('../routes/admin/preview-audio')
const config = require('../config')
const logger = require('fomoplayer_shared').logger(__filename)

// Downloads the audio of Bandcamp and Beatport previews that still need an analysis into the storage bucket, so the
// analyser workers (waveform, fingerprint, embedding) read it from there instead of each downloading it from the
// store, which rate-limits them. The stores are kept at a conservative pace, and a store that answers with a rate
// limit is left alone for 10 minutes, doubling up to an hour (the analyser's backoff).
//
// Beatport preview URLs are stored and need no token: they are downloaded one at a time, spaced out.
//
// Bandcamp stream URLs are signed for one track and expire, so they are not stored. Every Bandcamp request (release
// lookups and the stream_redirect downloads alike, all on bandcamp.com) goes through the backend's Bandcamp client,
// which spaces its requests 2 s apart (as the analyser does) and shares its rate-limit pause with playback. Stream
// URLs are stored on each preview (stream-urls.js), by the watch job when it adds the track and by every lookup, which
// stores the URLs of every track of the release, so most tracks are downloaded without looking their release up.
//
// The backend releases the audio once every analysis of the preview is done.

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

const DOWNLOAD_INTERVAL_MS = numberFromEnv('PREVIEW_AUDIO_DOWNLOAD_INTERVAL_MS', 1000)
const MAX_RUN_MS = numberFromEnv('PREVIEW_AUDIO_PREFETCH_MAX_RUN_MS', 8 * 60 * 1000)
const MAX_STORED = numberFromEnv('PREVIEW_AUDIO_PREFETCH_MAX_STORED', 1000)
const BATCH_SIZE = 500
const DOWNLOAD_TIMEOUT_MS = 60 * 1000
// The storage client uploads a file larger than its part size (64 MiB) as a multipart upload, whose completion it
// cannot parse from the Railway bucket, so files are kept below it.
const MULTIPART_THRESHOLD_BYTES = 64 * 1024 * 1024
// 30 MB is about 32 minutes at 128 kbps, Bandcamp's stream quality: longer than tracks, shorter than most DJ mixes.
// Longer recordings are left out of prefetching (they still play).
const MAX_AUDIO_BYTES = Math.min(
  numberFromEnv('PREVIEW_AUDIO_MAX_BYTES', 30 * 1024 * 1024),
  MULTIPART_THRESHOLD_BYTES - 1,
)
const PAUSE_MS = 10 * 60 * 1000
const MAX_PAUSE_MS = 60 * 60 * 1000

class RateLimited extends Error {}
class Gone extends Error {}
class TooLarge extends Error {
  constructor(bytes) {
    super(`Audio too large to prefetch (${bytes} bytes)`)
    this.bytes = bytes
  }
}
class StreamRefused extends Error {}

// Per-store pause after a rate limit. Kept across runs: the scheduler starts a new run every 10 minutes.
const createPauses = () => {
  const stores = {}
  const of = (store) => (stores[store] ??= { until: 0, pauseMs: PAUSE_MS })
  return {
    isPaused: (store, now) => of(store).until > now,
    pause: (store, now) => {
      const state = of(store)
      state.until = now + state.pauseMs
      state.pauseMs = Math.min(state.pauseMs * 2, MAX_PAUSE_MS)
      return state.until
    },
    reset: (store) => {
      of(store).pauseMs = PAUSE_MS
    },
  }
}
const pauses = createPauses()

// Resolves when the next download may start: intervalMs after the previous one started.
const createThrottle = (intervalMs, { now, sleep }) => {
  let last = -Infinity
  return async () => {
    const wait = last + intervalMs - now()
    if (wait > 0) await sleep(wait)
    last = now()
  }
}

// Downloads the audio at url and stores it in the bucket, returning its object key and size. request is fetch, or
// the Bandcamp client's throttled fetchStream.
const storeAudio = async ({ url, store, client, bucketName, request, maxBytes }) => {
  const res = await request(url, {
    headers: { 'User-Agent': bandcampApi.static.userAgent },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  })
  if (res.status === 429) throw new RateLimited(`${store} answered 429`)
  // An expired Bandcamp stream URL answers 403 or 410: the caller looks the release up again once.
  if (store === 'Bandcamp' && [403, 410].includes(res.status)) throw new StreamRefused(`HTTP ${res.status}`)
  if (res.status === 403) throw new RateLimited(`${store} answered 403`)
  if ([404, 410].includes(res.status)) throw new Gone(`HTTP ${res.status}`)
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  if (/text\/html/i.test(res.headers.get('content-type') || ''))
    throw new Error('Answered with a page instead of audio')

  // The file is read whole and uploaded with its size. Without a size the storage client streams it as a multipart
  // upload, and the Railway bucket answers the completing request in a form the client cannot parse ("BUG: failed to
  // parse server response"), so nothing was stored. A preview is a few megabytes at most (a full Bandcamp track), and
  // each store downloads one at a time.
  const length = Number(res.headers.get('content-length'))
  if (length > maxBytes) {
    // Leave the body unread: the announced size is enough.
    await res.body.cancel().catch(() => {})
    throw new TooLarge(length)
  }
  const audio = Buffer.from(await res.arrayBuffer())
  if (audio.length === 0) throw new Error('Empty response')
  if (audio.length > maxBytes) throw new TooLarge(audio.length)

  const objectKey = `${OBJECT_KEY_PREFIX}${crypto.randomUUID()}.mp3`
  await client.putObject(bucketName, objectKey, audio, audio.length, { 'Content-Type': 'audio/mpeg' })
  return { objectKey, fileSize: audio.length }
}

// The host a failed request went to, the underlying cause (Node's fetch reports only "fetch failed" and keeps the
// reason, e.g. ENOTFOUND or ECONNRESET, in error.cause), and whether no connection could be made at all. Those
// failures, and timeouts, are not the preview's fault: an unreachable host or a network outage must not get previews
// marked missing.
const describeFailure = (error) => {
  let host = null
  try {
    host = error.url ? new URL(error.url).host : null
  } catch {
    host = null
  }
  const cause = error.cause?.code || error.cause?.name || error.cause?.message || null
  const connectionFailure =
    (error.name === 'TypeError' && error.message === 'fetch failed') ||
    ['TimeoutError', 'AbortError'].includes(error.name)
  return { host, cause, connectionFailure }
}

module.exports.prefetchPreviewAudio = async (
  _jobRun,
  {
    client = getMinioClient(),
    bucketName = getBucketName(),
    fetch = globalThis.fetch,
    // Looks a release up and stores the stream URLs of all its tracks.
    getRelease = (releaseUrl) => refreshReleaseStreamUrls(releaseUrl),
    // The stream URL stored on the preview, by the watch job that added it or by an earlier lookup.
    getKnownStreamUrl = (preview) => queryStoredStreamUrl(preview.preview_id),
    fetchBandcampStream = bandcampApi.fetchStream,
    suspendBandcamp = bandcampApi.suspendRequests,
    isBandcampRateLimited = bandcampApi.static.isRateLimited,
    storePauses = pauses,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    downloadIntervalMs = DOWNLOAD_INTERVAL_MS,
    maxRunMs = MAX_RUN_MS,
    maxStored = MAX_STORED,
    batchSize = BATCH_SIZE,
    maxBytes = MAX_AUDIO_BYTES,
    isPreviewEnv = config.isPreviewEnv,
  } = {},
) => {
  // Pull-request previews run no analyser, so their downloads would only add to the stores' rate limits.
  if (isPreviewEnv) return { success: true, result: { skipped: 'Not run in preview environments' } }
  if (!client || !bucketName) return { success: false, result: { error: 'Object storage is not configured' } }

  const started = now()
  const deadline = started + maxRunMs
  const result = {
    released: 0,
    stored: 0,
    missing: 0,
    failed: 0,
    tooLarge: 0,
    lookups: 0,
    rateLimited: [],
    capReached: false,
  }

  result.released = await releaseAnalysedPreviewAudio({ client, bucketName })

  let room = maxStored - (await countStoredPreviewAudio())
  if (room <= 0) {
    logger.info('Stored preview audio is at its cap, waiting for the analyser to catch up', { maxStored })
    return { success: true, result: { ...result, capReached: true } }
  }

  const previews = await queryPreviewsToPrefetch(Math.min(batchSize, room), maxBytes)

  const markMissing = async (preview, reason) => {
    logger.info('Marking preview missing', { previewId: preview.preview_id, reason })
    await markPreviewsMissing([preview.preview_id])
    result.missing++
  }

  const recordTooLarge = async (preview, error) => {
    logger.info('Preview audio is too large to prefetch', { previewId: preview.preview_id, bytes: error.bytes })
    await recordPreviewAudioTooLarge(preview.preview_id, error.bytes)
    result.tooLarge++
  }

  const recordFailure = async (preview, error) => {
    const { host, cause, connectionFailure } = describeFailure(error)
    const message =
      cause || host ? `${error.message} (${[cause, host && `from ${host}`].filter(Boolean).join(' ')})` : error.message
    const attempts = await recordPreviewAudioFailure(preview.preview_id, message, { countAttempt: !connectionFailure })
    logger.warn('Downloading preview audio failed', {
      previewId: preview.preview_id,
      attempts,
      error: error.message,
      cause,
      host,
      connectionFailure,
    })
    result.failed++
    if (!connectionFailure && attempts >= MAX_FAILED_ATTEMPTS) {
      await markMissing(preview, `${attempts} failed downloads`)
    }
  }

  // Returns false when the store should not be asked for anything more in this run.
  const canContinue = (store) => {
    if (room <= 0) {
      result.capReached = true
      return false
    }
    return now() < deadline && !storePauses.isPaused(store, now())
  }

  const stopForRateLimit = (store, error) => {
    const until = storePauses.pause(store, now())
    logger.warn(`${store} rate limited the preview audio prefetch, pausing it`, {
      error: error.message,
      until: new Date(until).toISOString(),
    })
    result.rateLimited.push(store)
  }

  const download = async (preview, url, request) => {
    const { objectKey, fileSize } = await storeAudio({
      url,
      store: preview.store_name,
      client,
      bucketName,
      request,
      maxBytes,
    }).catch((error) => {
      error.url ??= url
      throw error
    })
    await recordStoredPreviewAudio(preview.preview_id, objectKey, fileSize)
    storePauses.reset(preview.store_name)
    room--
    result.stored++
  }

  const prefetchBeatport = async (beatportPreviews) => {
    const throttle = createThrottle(downloadIntervalMs, { now, sleep })
    const request = async (url, init) => {
      await throttle()
      return fetch(url, init)
    }
    for (const preview of beatportPreviews) {
      if (!canContinue('Beatport')) return
      try {
        await download(preview, preview.url, request)
      } catch (error) {
        if (error instanceof RateLimited) return stopForRateLimit('Beatport', error)
        if (error instanceof Gone) await markMissing(preview, error.message)
        else if (error instanceof TooLarge) await recordTooLarge(preview, error)
        else await recordFailure(preview, error)
      }
    }
  }

  const prefetchBandcamp = async (bandcampPreviews) => {
    const releases = new Map()
    for (const preview of bandcampPreviews) {
      releases.set(preview.release_url, [...(releases.get(preview.release_url) || []), preview])
    }

    for (const [releaseUrl, releasePreviews] of releases) {
      if (!canContinue('Bandcamp')) return
      // The Bandcamp client pauses itself after a rate limit, for playback too: don't add to it while it is paused.
      if (isBandcampRateLimited()) {
        result.rateLimited.push('Bandcamp')
        return
      }
      let release = null
      const lookUp = async () => {
        release = await getRelease(releaseUrl).catch((error) => {
          error.url ??= releaseUrl
          throw error
        })
        result.lookups++
      }
      // A fresh release has the newest stream URLs; without one, those known from before.
      const known = new Map()
      for (const preview of releasePreviews) known.set(preview.preview_id, await getKnownStreamUrl(preview))
      const streamUrlOf = (preview) =>
        release ? findStreamUrl(release, preview.store_track_id) : known.get(preview.preview_id)

      if (releasePreviews.some((preview) => !streamUrlOf(preview))) {
        try {
          await lookUp()
        } catch (error) {
          if (error.isRateLimit) return stopForRateLimit('Bandcamp', error)
          for (const preview of releasePreviews) {
            if ([404, 410].includes(error.statusCode)) await markMissing(preview, `release ${error.message}`)
            else await recordFailure(preview, error)
          }
          continue
        }
      }

      for (const preview of releasePreviews) {
        if (!canContinue('Bandcamp')) return
        try {
          let lookedUpAgain = false
          for (;;) {
            const streamUrl = streamUrlOf(preview)
            if (!streamUrl) {
              // A stored URL can have aged out during the run: look the release up before giving up on the track.
              if (!release) {
                await lookUp()
                continue
              }
              await markMissing(preview, 'Bandcamp does not stream the track')
              break
            }
            try {
              await download(preview, streamUrl, fetchBandcampStream)
              break
            } catch (error) {
              if (!(error instanceof StreamRefused)) throw error
              // Stream URLs expire: look the release up once more before treating the refusal as a rate limit,
              // which pauses all Bandcamp requests, as any other rate limit from bandcamp.com does.
              if (lookedUpAgain) {
                suspendBandcamp(streamUrl, `stream refused twice (${error.message})`)
                throw new RateLimited(`Bandcamp refused the stream (${error.message})`)
              }
              lookedUpAgain = true
              await lookUp()
            }
          }
        } catch (error) {
          if (error instanceof RateLimited || error.isRateLimit) return stopForRateLimit('Bandcamp', error)
          if (error instanceof TooLarge) await recordTooLarge(preview, error)
          else await recordFailure(preview, error)
        }
      }
    }
  }

  // The stores are separate hosts with their own limits, so they are downloaded from side by side.
  await Promise.all([
    prefetchBeatport(previews.filter(({ store_name }) => store_name === 'Beatport')),
    prefetchBandcamp(previews.filter(({ store_name }) => store_name === 'Bandcamp')),
  ])

  logger.info('Preview audio prefetch run done', { ...result, durationMs: now() - started })
  return { success: true, result }
}

module.exports.createPauses = createPauses
