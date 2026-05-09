const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { JSDOM } = require('jsdom')
const { test } = require('cascade-test')

// Mirrors the selector used by `getReleaseUrls` in
// packages/back/routes/stores/bandcamp/bandcamp-api.js. Kept in sync there
// so a Bandcamp markup change that breaks one breaks the other too — and
// the steady-state skip-unchanged path is exercised against a real fixture.

const FIXTURE_PATH = path.join(__dirname, '..', '..', 'fixtures', 'bandcamp', 'bandcamp-artist-page.html')

const extractReleaseUrls = (host, html) => {
  const dom = new JSDOM(html)
  const items = dom.window.document.querySelectorAll('#music-grid a, .featured-grid a, .results-grid-item a')
  return Array.from(items).map((i) => new URL(i.getAttribute('href'), host).toString())
}

test({
  setup: () => {
    const html = fs.readFileSync(FIXTURE_PATH, 'utf8')
    return { html }
  },

  'extracts release URLs from a real Bandcamp artist page': ({ html }) => {
    const host = 'https://noisia.bandcamp.com'
    const urls = extractReleaseUrls(host, html)
    assert.ok(urls.length > 10, `expected > 10 release URLs from the fixture, got ${urls.length}`)
    for (const url of urls) {
      assert.match(url, /^https:\/\/noisia\.bandcamp\.com\/(album|track)\//,
        `each URL should be an absolute album/track URL on the artist host, got ${url}`)
    }
  },

  'release URLs are stable across reads (no DOM mutation side-effects)': ({ html }) => {
    const host = 'https://noisia.bandcamp.com'
    const a = extractReleaseUrls(host, html)
    const b = extractReleaseUrls(host, html)
    assert.deepStrictEqual(a, b, 'parsing the same fixture twice must produce the same URL list')
  },
})
