const crypto = require('crypto')
const { Readable, Transform } = require('stream')
const { getMinioClient, getBucketName } = require('../routes/shared/minio')
const bandcampApi = require('../routes/stores/bandcamp/bandcamp-api')
const { knownStreamUrl, refreshReleaseStreamUrls, findStreamUrl } = require('../routes/stores/bandcamp/stream-urls')
const { markPreviewsMissing } = require('../routes/admin/db')
const {
  OBJECT_KEY_PREFIX,
  MAX_FAILED_ATTEMPTS,
  queryPreviewsToPrefetch,
  countStoredPreviewAudio,
  recordStoredPreviewAudio,
  recordPreviewAudioFailure,
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
// URLs are stored per preview (stream-urls.js) and kept by the client for tracks the watch job has just added, so most
// tracks are downloaded without looking their release up; a lookup stores the URLs of every track of the release.
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
const PAUSE_MS = 10 * 60 * 1000
const MAX_PAUSE_MS = 60 * 60 * 1000

class RateLimited extends Error {}
class Gone extends Error {}
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

const countBytes = () => {
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      counter.bytes += chunk.length
      callback(null, chunk)
    },
  })
  counter.bytes = 0
  return counter
}

// Streams the audio at url into the bucket and returns its object key and size. request is fetch, or the Bandcamp
// client's throttled fetchStream.
const storeAudio = async ({ url, store, client, bucketName, request }) => {
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

  const objectKey = `${OBJECT_KEY_PREFIX}${crypto.randomUUID()}.mp3`
  const counter = countBytes()
  const body = Readable.fromWeb(res.body)
  body.on('error', (error) => counter.destroy(error))
  try {
    await client.putObject(bucketName, objectKey, body.pipe(counter), undefined, { 'Content-Type': 'audio/mpeg' })
  } finally {
    body.destroy()
  }
  if (counter.bytes === 0) {
    await client.removeObject(bucketName, objectKey).catch(() => {})
    throw new Error('Empty response')
  }
  return { objectKey, fileSize: counter.bytes }
}

module.exports.prefetchPreviewAudio = async (
  _jobRun,
  {
    client = getMinioClient(),
    bucketName = getBucketName(),
    fetch = globalThis.fetch,
    // Looks a release up and stores the stream URLs of all its tracks.
    getRelease = (releaseUrl) => refreshReleaseStreamUrls(releaseUrl),
    // A stream URL known without asking Bandcamp: stored, or kept from the release fetch that added the track.
    getKnownStreamUrl = (preview) =>
      knownStreamUrl({ previewId: preview.preview_id, storeTrackId: preview.store_track_id }),
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
    isPreviewEnv = config.isPreviewEnv,
  } = {},
) => {
  // Pull-request previews run no analyser, so their downloads would only add to the stores' rate limits.
  if (isPreviewEnv) return { success: true, result: { skipped: 'Not run in preview environments' } }
  if (!client || !bucketName) return { success: false, result: { error: 'Object storage is not configured' } }

  const started = now()
  const deadline = started + maxRunMs
  const result = { released: 0, stored: 0, missing: 0, failed: 0, lookups: 0, rateLimited: [], capReached: false }

  result.released = await releaseAnalysedPreviewAudio({ client, bucketName })

  let room = maxStored - (await countStoredPreviewAudio())
  if (room <= 0) {
    logger.info('Stored preview audio is at its cap, waiting for the analyser to catch up', { maxStored })
    return { success: true, result: { ...result, capReached: true } }
  }

  const previews = await queryPreviewsToPrefetch(Math.min(batchSize, room))

  const markMissing = async (preview, reason) => {
    logger.info('Marking preview missing', { previewId: preview.preview_id, reason })
    await markPreviewsMissing([preview.preview_id])
    result.missing++
  }

  const recordFailure = async (preview, error) => {
    const attempts = await recordPreviewAudioFailure(preview.preview_id, error.message)
    logger.warn('Downloading preview audio failed', { previewId: preview.preview_id, attempts, error: error.message })
    result.failed++
    if (attempts >= MAX_FAILED_ATTEMPTS) await markMissing(preview, `${attempts} failed downloads`)
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
    const { objectKey, fileSize } = await storeAudio({ url, store: preview.store_name, client, bucketName, request })
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
        release = await getRelease(releaseUrl)
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
              // A kept URL can have aged out during the run: look the release up before giving up on the track.
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
          await recordFailure(preview, error)
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
