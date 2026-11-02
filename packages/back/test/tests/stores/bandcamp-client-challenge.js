/**
 * Bandcamp sits behind Fastly, which since 2026-10-30 answers requests that
 * carry Node's default User-Agent (or a spoofed browser one) from datacenter
 * addresses with an HTTP 200 "Client Challenge" page instead of the real page.
 * Parsed as a normal page it looks like an artist with no releases. These tests
 * drive the real bandcamp-api module through a stubbed global fetch and check
 * that (1) every request identifies the client with a descriptive User-Agent
 * and (2) a challenge page is treated like a rate limit so the fetch loop backs
 * off instead of silently storing nothing.
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { test } = require('cascade-test')

const bandcampApi = require('../../../routes/stores/bandcamp/bandcamp-api.js')
const { isChallengePage, userAgent, resetRateLimit, isRateLimited } = bandcampApi.static

const fixture = (name) => fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'bandcamp', name), 'utf8')
const challengeHtml = fixture('bandcamp-client-challenge.html')
const artistHtml = fixture('bandcamp-artist-page.html')

// bandcamp-api resolves the global fetch at call time, so a stub installed for
// the duration of one test observes exactly the request the module makes.
const withFetch = async (impl, fn) => {
  const original = global.fetch
  global.fetch = impl
  try {
    return await fn()
  } finally {
    global.fetch = original
  }
}

const htmlResponse = (html) =>
  new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
const jsonResponse = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

const recordingFetch = (respond) => {
  const requests = []
  const impl = async (url, init = {}) => {
    requests.push({ url, userAgent: new Headers(init.headers || {}).get('user-agent') })
    return respond(url)
  }
  return { impl, requests }
}

test({
  'isChallengePage recognises the Fastly challenge page and not a real page': () => {
    assert.strictEqual(isChallengePage(challengeHtml), true)
    assert.strictEqual(isChallengePage(artistHtml), false)
    assert.strictEqual(isChallengePage(''), false)
  },

  'the configured User-Agent is descriptive and does not name the product': () => {
    assert.ok(typeof userAgent === 'string' && userAgent.length > 0)
    assert.notStrictEqual(userAgent, 'node')
    assert.doesNotMatch(userAgent, /mozilla|chrome|safari|firefox/i, 'must not impersonate a browser')
    assert.doesNotMatch(userAgent, /fomo/i, 'must not name the product')
  },

  'artist page and release requests carry the User-Agent': async () => {
    resetRateLimit()
    const { impl, requests } = recordingFetch(() => htmlResponse(artistHtml))
    await withFetch(impl, async () => {
      const { releaseUrls } = await bandcampApi.getArtistAsync('https://noisia.bandcamp.com')
      assert.ok(releaseUrls.length > 0, 'the stubbed artist page should still parse normally')
      await bandcampApi.getReleaseAsync(releaseUrls[0])
    })
    assert.strictEqual(requests.length, 2)
    for (const { url, userAgent: sent } of requests) {
      assert.strictEqual(sent, userAgent, `request to ${url} must send the configured User-Agent`)
    }
  },

  'search and discover API requests carry the User-Agent': async () => {
    resetRateLimit()
    const { impl, requests } = recordingFetch((url) =>
      url.includes('autocomplete_elastic') ? jsonResponse({ auto: { results: [] } }) : jsonResponse({ results: [] }),
    )
    await withFetch(impl, async () => {
      await bandcampApi.getSearchResultsAsync('noisia')
      await bandcampApi.getTagReleasesAsync({ genre: 'electronic' })
    })
    assert.strictEqual(requests.length, 2)
    for (const { url, userAgent: sent } of requests) {
      assert.strictEqual(sent, userAgent, `request to ${url} must send the configured User-Agent`)
    }
  },

  'a challenge page is reported as a rate limit and suspends further requests': async () => {
    resetRateLimit()
    const { impl, requests } = recordingFetch(() => htmlResponse(challengeHtml))
    try {
      await withFetch(impl, async () => {
        await assert.rejects(bandcampApi.getArtistAsync('https://noisia.bandcamp.com'), (e) => {
          assert.strictEqual(e.isRateLimit, true, 'challenge must be surfaced as a rate limit')
          assert.strictEqual(e.isChallenge, true)
          assert.match(e.message, /challenge/i)
          return true
        })
        assert.strictEqual(isRateLimited(), true)
        await assert.rejects(bandcampApi.getReleaseAsync('https://noisia.bandcamp.com/album/x'), (e) => e.isRateLimit === true)
      })
      assert.strictEqual(requests.length, 1, 'suspended requests must not reach fetch')
    } finally {
      resetRateLimit()
    }
  },
})
