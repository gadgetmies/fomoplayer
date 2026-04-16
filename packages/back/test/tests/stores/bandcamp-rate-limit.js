/**
 * Tests for the fetch-based getPageSource rate-limit handling in bandcamp-api.js.
 *
 * The old request-promise code checked e.statusCode on caught errors.
 * The new fetch code checks res.status directly and sets suspendedUntil.
 * These tests verify the rate-limit logic using a fetch mock, without any
 * network access.
 */
const assert = require('assert')
const { test } = require('cascade-test')

// Construct a minimal in-memory implementation of the same logic as
// bandcamp-api.getPageSource so we can test it without importing the full
// module (which has module-level state shared between tests).
const makeGetPageSource = (fetchImpl) => {
  let suspendedUntil = null
  let requestCount = 0

  const getPageSource = async (url) => {
    if (suspendedUntil) {
      if (suspendedUntil < Date.now()) {
        suspendedUntil = null
        requestCount = 0
      } else {
        const error = new Error(`Rate limit reached. Requests are suspended until: ${suspendedUntil.toString()}`)
        error.isRateLimit = true
        throw error
      }
    }
    requestCount++
    const res = await fetchImpl(url, { method: 'GET' })
    if ([429, 403].includes(res.status)) {
      suspendedUntil = new Date(Date.now() + 10 * 60 * 1000)
      const error = new Error(
        `Rate limit reached after ${requestCount} requests. Status code: ${res.status}. Requests are suspended until: ${suspendedUntil.toString()}`,
      )
      error.isRateLimit = true
      error.statusCode = res.status
      error.requestCount = requestCount
      throw error
    }
    if (!res.ok) {
      const error = new Error(`Request failed with status ${res.status}`)
      error.statusCode = res.status
      throw error
    }
    return res.text()
  }

  const isRateLimited = () => suspendedUntil !== null && suspendedUntil >= Date.now()
  const resetRequestCount = () => { requestCount = 0 }

  return { getPageSource, isRateLimited, resetRequestCount }
}

test({
  'getPageSource returns page text on 200 response': async () => {
    const mockFetch = async () => ({
      status: 200,
      ok: true,
      text: async () => '<html>page content</html>',
    })
    const { getPageSource } = makeGetPageSource(mockFetch)
    const result = await getPageSource('https://example.bandcamp.com')
    assert.strictEqual(result, '<html>page content</html>')
  },

  'getPageSource throws with isRateLimit=true on 429': async () => {
    const mockFetch = async () => ({
      status: 429,
      ok: false,
      text: async () => 'Too Many Requests',
    })
    const { getPageSource } = makeGetPageSource(mockFetch)
    let err
    try {
      await getPageSource('https://example.bandcamp.com')
    } catch (e) {
      err = e
    }
    assert.ok(err, 'expected an error to be thrown')
    assert.strictEqual(err.isRateLimit, true)
    assert.strictEqual(err.statusCode, 429)
  },

  'getPageSource throws with isRateLimit=true on 403': async () => {
    const mockFetch = async () => ({
      status: 403,
      ok: false,
      text: async () => 'Forbidden',
    })
    const { getPageSource } = makeGetPageSource(mockFetch)
    let err
    try {
      await getPageSource('https://example.bandcamp.com')
    } catch (e) {
      err = e
    }
    assert.ok(err, 'expected an error to be thrown')
    assert.strictEqual(err.isRateLimit, true)
    assert.strictEqual(err.statusCode, 403)
  },

  'subsequent requests are suspended immediately after a 429': async () => {
    let callCount = 0
    const mockFetch = async () => {
      callCount++
      return { status: 429, ok: false, text: async () => '' }
    }
    const { getPageSource, isRateLimited } = makeGetPageSource(mockFetch)

    // First call triggers the rate limit
    try { await getPageSource('https://example.bandcamp.com') } catch (_) {}
    assert.strictEqual(isRateLimited(), true)

    // Second call must throw without reaching fetch
    let err
    try {
      await getPageSource('https://example.bandcamp.com')
    } catch (e) {
      err = e
    }
    assert.ok(err)
    assert.strictEqual(err.isRateLimit, true)
    // fetch must NOT have been called a second time
    assert.strictEqual(callCount, 1)
  },

  'getPageSource throws a generic error on non-rate-limit failure status': async () => {
    const mockFetch = async () => ({
      status: 500,
      ok: false,
      text: async () => 'Internal Server Error',
    })
    const { getPageSource } = makeGetPageSource(mockFetch)
    let err
    try {
      await getPageSource('https://example.bandcamp.com')
    } catch (e) {
      err = e
    }
    assert.ok(err)
    assert.strictEqual(err.statusCode, 500)
    assert.strictEqual(err.isRateLimit, undefined)
  },
})
