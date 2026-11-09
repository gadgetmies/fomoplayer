/**
 * Error classification for the Beatport v4 API client (bp-api.js apiGet).
 *
 * The track-fetch handlers in routes/shared/tracks.js only mark an artist/label
 * `missing` when the caught error reports `statusCode === 404`, and they treat
 * `isRateLimit` errors as a transient back-off (never missing). For that to work
 * the client must attach those fields to the error it throws — otherwise a
 * definitive 404 looks identical to a transient 5xx and the entity is retried
 * forever. These tests pin that contract.
 *
 * BEATPORT_API_MOCK makes getAccessToken return a canned token, so mocking
 * global.fetch is enough to drive apiGet without any network or real auth.
 */
const assert = require('assert')
const { test } = require('cascade-test')
const bpApi = require('../../../routes/stores/beatport/bp-api')

const originalFetch = global.fetch
const originalMock = process.env.BEATPORT_API_MOCK

const mockResponse = ({ status, body = '' }) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  json: async () => (typeof body === 'string' ? JSON.parse(body || '{}') : body),
})

const catchError = async (fn) => {
  try {
    await fn()
    return null
  } catch (e) {
    return e
  }
}

test({
  setup: async () => {
    process.env.BEATPORT_API_MOCK = '1'
  },
  teardown: async () => {
    global.fetch = originalFetch
    if (originalMock === undefined) delete process.env.BEATPORT_API_MOCK
    else process.env.BEATPORT_API_MOCK = originalMock
  },

  'a definitive 404 throws an error carrying statusCode 404 (so callers mark the entity missing)': async () => {
    global.fetch = async () => mockResponse({ status: 404, body: { detail: 'No Artist matches the given query.' } })
    const err = await catchError(() => bpApi.getArtist('614588'))
    assert.ok(err, 'expected getArtist to throw on 404')
    assert.strictEqual(err.statusCode, 404)
    assert.ok(!err.isRateLimit, 'a 404 is not a rate limit')
  },

  'getArtistTracks surfaces the 404 statusCode too (the endpoint in the reported log line)': async () => {
    global.fetch = async () => mockResponse({ status: 404, body: { detail: 'No Artist matches the given query.' } })
    const err = await catchError(() => bpApi.getArtistTracks('614588'))
    assert.ok(err, 'expected getArtistTracks to throw on 404')
    assert.strictEqual(err.statusCode, 404)
  },

  'a transient 500 carries its statusCode but is NOT a rate limit (callers re-throw and retry, never mark missing)':
    async () => {
      global.fetch = async () => mockResponse({ status: 500, body: 'Internal Server Error' })
      const err = await catchError(() => bpApi.getLabel('123'))
      assert.ok(err, 'expected getLabel to throw on 500')
      assert.strictEqual(err.statusCode, 500)
      assert.strictEqual(err.isRateLimit, undefined)
    },

  'a 429 is flagged isRateLimit so callers back off instead of marking missing': async () => {
    global.fetch = async () => mockResponse({ status: 429, body: 'Too Many Requests' })
    const err = await catchError(() => bpApi.getArtist('123'))
    assert.ok(err, 'expected getArtist to throw on 429')
    assert.strictEqual(err.statusCode, 429)
    assert.strictEqual(err.isRateLimit, true)
  },

  'a 401 still triggers exactly one re-auth retry and then succeeds': async () => {
    let calls = 0
    global.fetch = async () => {
      calls++
      return calls === 1
        ? mockResponse({ status: 401, body: 'Unauthorized' })
        : mockResponse({ status: 200, body: { id: 123, name: 'Rohaan' } })
    }
    const result = await bpApi.getArtist('123')
    assert.strictEqual(calls, 2, 'expected one retry after the 401')
    assert.strictEqual(result.name, 'Rohaan')
  },
})
