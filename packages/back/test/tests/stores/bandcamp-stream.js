/**
 * The preview audio prefetch job downloads Bandcamp tracks through the Bandcamp client: the stream URLs the mobile
 * endpoint returns are bandcamp.com/stream_redirect links, so a download is a request to the same edge as the page
 * requests and must share their spacing and rate-limit pause. The client also keeps the stream URLs of the releases
 * it fetched, so a newly added track is downloaded without looking its release up again.
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { test } = require('cascade-test')

const bandcampApi = require('../../../routes/stores/bandcamp/bandcamp-api.js')
const { resetRateLimit, resetReleaseIndex, resetStreamUrls, isRateLimited, getRequestCount } = bandcampApi.static

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
  resetStreamUrls()
}

test({
  'a fetched release keeps the stream URLs of its tracks': async () => {
    reset()
    const [track] = releaseJson.tracks
    await withFetch(
      async (url) => (url.includes('tralbum_details') ? jsonResponse(releaseJson) : htmlResponse(artistHtml)),
      async () => {
        const { releaseUrls } = await bandcampApi.getArtistAsync('https://noisia.bandcamp.com')
        await bandcampApi.getReleaseAsync(releaseUrls[0])
      },
    )
    assert.strictEqual(bandcampApi.getCachedStreamUrl(track.track_id), track.streaming_url['mp3-128'])
    assert.strictEqual(bandcampApi.getCachedStreamUrl(String(track.track_id)), track.streaming_url['mp3-128'])
    assert.strictEqual(bandcampApi.getCachedStreamUrl(track.track_id, -1), null, 'an aged URL is not trusted')
    assert.strictEqual(bandcampApi.getCachedStreamUrl(1), null)
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

  'a stream refused twice can pause all Bandcamp requests': () => {
    reset()
    const error = bandcampApi.suspendRequests(STREAM_URL, 'stream refused twice')
    assert.strictEqual(error.isRateLimit, true)
    assert.strictEqual(isRateLimited(), true)
    reset()
  },
})
