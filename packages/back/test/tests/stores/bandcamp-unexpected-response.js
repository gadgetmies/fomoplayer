const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { test } = require('cascade-test')

const bandcampApi = require('../../../routes/stores/bandcamp/bandcamp-api.js')
const {
  static: { isRateLimited, resetRateLimit, resetReleaseIndex },
} = bandcampApi

// Bandcamp has started answering the server with HTTP 200 and a page that is
// not the requested content. These tests stub fetch with such a page and check
// that the scraper reports it clearly and suspends requests, instead of
// crashing on missing elements.

const ARTIST_PAGE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'fixtures', 'bandcamp', 'bandcamp-artist-page.html'),
  'utf8',
)
const BLOCK_PAGE = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>Checking</body></html>'

const realFetch = globalThis.fetch

// Each test starts unsuspended with fetch answering every request with `body`.
const withStubbedFetch = (body, fn) => async () => {
  const requests = []
  resetRateLimit()
  resetReleaseIndex()
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return { status: 200, ok: true, text: async () => body }
  }
  try {
    await fn(requests)
  } finally {
    globalThis.fetch = realFetch
    resetRateLimit()
  }
}

const expectUnexpectedResponse = async (promise) => {
  let error
  try {
    await promise
  } catch (e) {
    error = e
  }
  assert.ok(error, 'expected an error')
  assert.strictEqual(error.isUnexpectedResponse, true)
  assert.strictEqual(error.isRateLimit, true)
  assert.match(error.message, /Just a moment\.\.\./)
  assert.strictEqual(isRateLimited(), true)
}

test({
  'a release fetch that gets a block page fails with an unexpected-response error': withStubbedFetch(
    BLOCK_PAGE,
    async () => {
      await expectUnexpectedResponse(bandcampApi.getReleaseAsync('https://example.bandcamp.com/album/x'))
    },
  ),

  'an artist fetch that gets a block page fails instead of listing no releases': withStubbedFetch(
    BLOCK_PAGE,
    async () => {
      await expectUnexpectedResponse(bandcampApi.getArtistAsync('https://example.bandcamp.com'))
    },
  ),

  'a discover fetch that gets HTML fails with an unexpected-response error': withStubbedFetch(BLOCK_PAGE, async () => {
    await expectUnexpectedResponse(bandcampApi.getTagReleasesAsync({ genre: 'electronic', subgenre: 'drum-bass' }))
  }),

  'a search that gets HTML fails with an unexpected-response error': withStubbedFetch(BLOCK_PAGE, async () => {
    await expectUnexpectedResponse(bandcampApi.getSearchResultsAsync('noisia'))
  }),

  'requests after a block page are suspended without reaching Bandcamp': withStubbedFetch(
    BLOCK_PAGE,
    async (requests) => {
      await bandcampApi.getArtistAsync('https://example.bandcamp.com').catch(() => {})
      await assert.rejects(bandcampApi.getArtistAsync('https://example.bandcamp.com'), (e) => {
        assert.strictEqual(e.isRateLimit, true)
        assert.match(
          e.message,
          /^Bandcamp requests are paused \(unexpected page "Just a moment\.\.\." instead of a Bandcamp band page\) until /,
        )
        return true
      })
      assert.strictEqual(requests.length, 1)
    },
  ),

  'requests after a 429 are suspended as a rate limit': async () => {
    resetRateLimit()
    globalThis.fetch = async () => ({ status: 429, ok: false, text: async () => 'Too Many Requests' })
    try {
      await assert.rejects(
        bandcampApi.getArtistAsync('https://example.bandcamp.com'),
        /^Error: Bandcamp rate limited \(HTTP 429\)/,
      )
      await assert.rejects(bandcampApi.getArtistAsync('https://example.bandcamp.com'), (e) => {
        assert.match(e.message, /^Bandcamp requests are paused \(HTTP 429\) until /)
        return true
      })
    } finally {
      globalThis.fetch = realFetch
      resetRateLimit()
    }
  },

  'a real artist page is still parsed': withStubbedFetch(ARTIST_PAGE, async () => {
    const { releaseUrls } = await bandcampApi.getArtistAsync('https://noisia.bandcamp.com')
    assert.ok(releaseUrls.length > 10, `expected > 10 release URLs, got ${releaseUrls.length}`)
    assert.strictEqual(isRateLimited(), false)
  }),
})
