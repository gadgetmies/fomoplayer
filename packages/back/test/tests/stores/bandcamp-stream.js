/**
 * The preview audio prefetch job downloads Bandcamp tracks through the Bandcamp client: the stream URLs the mobile
 * endpoint returns are bandcamp.com/stream_redirect links, so a download is a request to the same edge as the page
 * requests and must share their spacing and rate-limit pause.
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { test } = require('cascade-test')

const bandcampApi = require('../../../routes/stores/bandcamp/bandcamp-api.js')
const { resetRateLimit, resetReleaseIndex, isRateLimited, getRequestCount } = bandcampApi.static

const fixture = (name) => fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'bandcamp', name), 'utf8')
const challengeHtml = fixture('bandcamp-client-challenge.html')
const artistHtml = fixture('bandcamp-artist-page.html')
const releaseJson = require('fomoplayer_shared/interceptors/fixtures/bandcamp-tralbum-the-resonance-vi.json')

const withFetch = async (impl, fn) => {
  const original = global.fetch
  global.fetch = impl
  try {
    return await fn()
  } finally {
    global.fetch = original
  }
}

const htmlResponse = (html, status = 200) =>
  new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
const jsonResponse = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
const audioResponse = () => new Response('mp3 bytes', { status: 200, headers: { 'content-type': 'audio/mpeg' } })

const STREAM_URL = 'https://bandcamp.com/stream_redirect?enc=mp3-128&track_id=1&ts=1&t=x'

const reset = () => {
  resetRateLimit()
  resetReleaseIndex()
}

test({
  'a fetched release carries the stream_redirect URL of each track': async () => {
    reset()
    const [track] = releaseJson.tracks
    const release = await withFetch(
      async (url) => (url.includes('tralbum_details') ? jsonResponse(releaseJson) : htmlResponse(artistHtml)),
      async () => {
        const { releaseUrls } = await bandcampApi.getArtistAsync('https://noisia.bandcamp.com')
        return bandcampApi.fetchRelease(releaseUrls[0])
      },
    )
    const url = release.trackinfo.find(({ track_id }) => track_id === track.track_id).file['mp3-128']
    assert.strictEqual(url, track.streaming_url['mp3-128'])
    assert.strictEqual(bandcampApi.static.isRedirectStreamUrl(url), true)
  },

  'only stream_redirect URLs count as lasting, for 13 days by default': () => {
    const { isRedirectStreamUrl, streamUrlRefreshAgeMs } = bandcampApi.static
    assert.strictEqual(streamUrlRefreshAgeMs, 13 * 24 * 60 * 60 * 1000)
    assert.strictEqual(isRedirectStreamUrl(STREAM_URL), true)
    assert.strictEqual(isRedirectStreamUrl('https://t4.bcbits.com/stream/abc/mp3-128/1?p=0&ts=1&t=x'), false)
    assert.strictEqual(isRedirectStreamUrl('not a url'), false)
  },

  'an audio stream is returned and counted as a Bandcamp request': async () => {
    reset()
    const before = getRequestCount()
    const res = await withFetch(audioResponse, () => bandcampApi.fetchStream(STREAM_URL))
    assert.strictEqual(res.status, 200)
    assert.strictEqual(await res.text(), 'mp3 bytes')
    assert.strictEqual(getRequestCount(), before + 1)
  },

  'a refused stream is returned for the caller to look the release up again': async () => {
    reset()
    const res = await withFetch(
      async () => new Response('', { status: 403 }),
      () => bandcampApi.fetchStream(STREAM_URL),
    )
    assert.strictEqual(res.status, 403)
    assert.strictEqual(isRateLimited(), false)
  },

  'a 429 pauses all Bandcamp requests': async () => {
    reset()
    await withFetch(
      async () => new Response('', { status: 429 }),
      () => assert.rejects(bandcampApi.fetchStream(STREAM_URL), (e) => e.isRateLimit === true),
    )
    assert.strictEqual(isRateLimited(), true)
    let requested = false
    await withFetch(
      async () => {
        requested = true
        return audioResponse()
      },
      () => assert.rejects(bandcampApi.fetchStream(STREAM_URL), (e) => e.isSuspended === true),
    )
    assert.strictEqual(requested, false, 'nothing is requested while paused')
    reset()
  },

  'a challenge page instead of audio pauses all Bandcamp requests': async () => {
    reset()
    await withFetch(
      async () => htmlResponse(challengeHtml),
      () => assert.rejects(bandcampApi.fetchStream(STREAM_URL), (e) => e.isChallenge === true),
    )
    assert.strictEqual(isRateLimited(), true)
    reset()
  },

  'another page instead of audio fails without pausing': async () => {
    reset()
    await withFetch(
      async () => htmlResponse('<html><title>Not here</title></html>'),
      () => assert.rejects(bandcampApi.fetchStream(STREAM_URL), /instead of audio/),
    )
    assert.strictEqual(isRateLimited(), false)
  },

  'a priority request skips the queue but takes the slot': async () => {
    reset()
    const { setMinRequestInterval } = bandcampApi.static
    setMinRequestInterval(300)
    const started = []
    let t0
    try {
      await withFetch(
        async (url) => {
          started.push({ url, at: Date.now() - t0 })
          return audioResponse()
        },
        async () => {
          // A request that just went out: the queued ones wait a full interval after it.
          await bandcampApi.fetchStream(`${STREAM_URL}&first`)
          t0 = Date.now()
          started.length = 0
          const queued = [bandcampApi.fetchStream(`${STREAM_URL}&q=1`), bandcampApi.fetchStream(`${STREAM_URL}&q=2`)]
          await new Promise((resolve) => setTimeout(resolve, 50))
          await bandcampApi.fetchStream(`${STREAM_URL}&listener`, { priority: true })
          await Promise.all(queued)
        },
      )
    } finally {
      setMinRequestInterval(Number(process.env.BANDCAMP_MIN_REQUEST_INTERVAL_MS ?? 2000))
    }
    const at = Object.fromEntries(started.map(({ url, at }) => [url.split('&').pop(), at]))
    assert.deepStrictEqual(Object.keys(at), ['listener', 'q=1', 'q=2'], 'the listener goes ahead of the queue')
    assert.ok(at.listener < 150, `the listener did not wait for the interval (${at.listener} ms)`)
    assert.ok(at['q=1'] - at.listener >= 290, 'the queue waits a full interval after the listener')
    assert.ok(at['q=2'] - at['q=1'] >= 290, 'queued requests stay an interval apart')
  },

  'a stream refused twice can pause all Bandcamp requests': () => {
    reset()
    const error = bandcampApi.suspendRequests(STREAM_URL, 'stream refused twice')
    assert.strictEqual(error.isRateLimit, true)
    assert.strictEqual(isRateLimited(), true)
    reset()
  },
})
