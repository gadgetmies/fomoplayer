/**
 * Release pages are served as a Fastly client challenge to the backend, so
 * release details come from Bandcamp's JSON tralbum_details endpoint. These
 * tests cover the two pure pieces that make that work: reading release ids off
 * a /music page, and shaping the JSON response like the data-tralbum blob the
 * releases transform expects.
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { JSDOM } = require('jsdom')
const { test } = require('cascade-test')

const {
  static: { parseReleaseIndex, tralbumToReleaseInfo },
} = require('../../../routes/stores/bandcamp/bandcamp-api.js')

const artistHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'bandcamp', 'bandcamp-artist-page.html'), 'utf8')
const labelHtml = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', 'shared', 'interceptors', 'fixtures', 'bandcamp-vision.html'),
  'utf8',
)
const tralbum = require('fomoplayer_shared/interceptors/fixtures/bandcamp-tralbum-the-resonance-vi.json')

test({
  'every grid tile on an artist page yields its item and band ids': () => {
    const index = parseReleaseIndex('https://noisia.bandcamp.com', new JSDOM(artistHtml))
    assert.ok(index.size > 10, `expected the fixture's grid to be indexed, got ${index.size} entries`)
    for (const [url, { type, id, bandId }] of index) {
      assert.match(url, /^https:\/\/noisia\.bandcamp\.com\/(album|track)\/[^?#]+$/, 'keys are release URLs without query')
      assert.ok(['album', 'track'].includes(type))
      assert.match(id, /^\d+$/)
      assert.match(bandId, /^\d+$/)
    }
  },

  'label page tiles that link to another subdomain are keyed without the label query': () => {
    const index = parseReleaseIndex('https://visionrecordings.bandcamp.com', new JSDOM(labelHtml))
    assert.deepStrictEqual(index.get('https://billainaethek.bandcamp.com/album/f4k-y00'), {
      type: 'album',
      id: '3959806045',
      bandId: '3470339956',
    })
    assert.deepStrictEqual(index.get('https://billainaethek.bandcamp.com/album/different-eyes-ep'), {
      type: 'album',
      id: '1051734106',
      bandId: '3470339956',
    })
  },

  'a tralbum_details response is shaped like the scraped data-tralbum blob': () => {
    const url = 'https://noisia.bandcamp.com/album/the-resonance-vi'
    const info = tralbumToReleaseInfo(tralbum, url)
    assert.strictEqual(info.url, url)
    assert.strictEqual(info.id, tralbum.id)
    assert.strictEqual(info.item_type, 'album')
    assert.strictEqual(info.artist, 'Noisia')
    assert.strictEqual(info.current.title, 'The Resonance VI')
    assert.strictEqual(info.current.band_id, 96499241)
    // Bandcamp's page date format, so `released` and `release_date` stay equal.
    assert.match(info.album_release_date, /^\d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/)
    assert.strictEqual(info.current.release_date, info.album_release_date)
    assert.strictEqual(new Date(info.album_release_date).getTime(), tralbum.release_date * 1000)
    assert.strictEqual(info.trackinfo.length, tralbum.tracks.length)
    const [first] = info.trackinfo
    assert.strictEqual(first.id, first.track_id)
    assert.strictEqual(typeof first.duration, 'number')
    assert.match(first.file['mp3-128'], /^https:\/\//)
  },

  'tracks credited to the band itself carry no artist override, others do': () => {
    const info = tralbumToReleaseInfo(tralbum, 'https://noisia.bandcamp.com/album/the-resonance-vi')
    const byBand = info.trackinfo.filter((t) => t.artist === null)
    const overridden = info.trackinfo.filter((t) => t.artist !== null)
    assert.ok(byBand.length > 0, 'tracks by the band alone must not repeat the band as artist')
    assert.ok(overridden.length > 0, 'collaboration tracks keep their credited artists')
    for (const t of overridden) assert.notStrictEqual(t.artist, 'Noisia')
  },

  'a per-track artist is prefixed onto the title the way the page blob does': () => {
    const info = tralbumToReleaseInfo(tralbum, 'https://noisia.bandcamp.com/album/the-resonance-vi')
    for (const t of info.trackinfo) {
      if (t.artist) assert.ok(t.title.startsWith(`${t.artist} - `), `${t.title} should start with ${t.artist} - `)
      else assert.doesNotMatch(t.title, /^Noisia - /)
    }
  },

  'a release already out is published on its release date, a preorder from when it is seen': () => {
    const base = { id: 1, type: 'a', title: 'X', band: { band_id: 2, name: 'Band' }, tracks: [] }
    const now = Date.UTC(2026, 10, 2, 12, 0, 0)
    const out = tralbumToReleaseInfo({ ...base, release_date: 1700000000 }, 'https://b.bandcamp.com/album/x', now)
    assert.strictEqual(out.current.publish_date, out.current.release_date)
    const preorder = tralbumToReleaseInfo({ ...base, release_date: 2000000000 }, 'https://b.bandcamp.com/album/x', now)
    assert.strictEqual(new Date(preorder.current.release_date).getTime(), 2000000000 * 1000)
    assert.strictEqual(new Date(preorder.current.publish_date).getTime(), now)
  },

  'tracks without a stream have no file so the transform drops them': () => {
    const info = tralbumToReleaseInfo(
      {
        id: 1,
        type: 'a',
        title: 'X',
        release_date: 1700000000,
        band: { band_id: 2, name: 'Band' },
        tracks: [
          { track_id: 10, title: 'A', duration: 1, band_name: 'Band', streaming_url: null },
          { track_id: 11, title: 'B', duration: 1, band_name: 'Band', streaming_url: { 'mp3-128': 'https://x/y' } },
        ],
      },
      'https://band.bandcamp.com/album/x',
    )
    assert.deepStrictEqual(
      info.trackinfo.map((t) => [t.track_id, t.file]),
      [
        [10, null],
        [11, { 'mp3-128': 'https://x/y' }],
      ],
    )
  },
})
