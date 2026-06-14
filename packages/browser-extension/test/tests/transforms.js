'use strict'

const assert = require('assert')
const { test } = require('cascade-test')
const { beatportTrackTransform } = require('../../src/js/transforms/beatport')
const { bandcampTagTracksTransform, bandcampReleasesTransform } = require('../../src/js/transforms/bandcamp')

const release = (overrides) => ({
  id: 1,
  artist: 'Ivy Lab',
  album_release_date: '01 Jan 2016 00:00:00 GMT',
  current: {
    title: 'Blonde E.P',
    publish_date: '01 Jan 2016 00:00:00 GMT',
    release_date: null,
    band_id: 777,
  },
  trackinfo: [{ id: 11, title: 'Husk', artist: null, file: { 'mp3-128': 'x' }, duration: 100 }],
  ...overrides,
})

test({
  'beatportTrackTransform': {
    'maps a Beatport track payload to the canonical shape': () => {
      const input = {
        id: 12345,
        slug: 'foo-bar',
        name: 'Foo',
        mix_name: 'Original Mix',
        length_ms: 360000,
        sample_url: 'https://geo-samples.beatport.com/track/foo.mp3',
        isrc: 'GBABC1234567',
        number: 3,
        artists: [{ id: 1, slug: 'a-one', name: 'Alice' }],
        remixers: [],
        genre: { name: 'House', slug: 'house', url: 'https://www.beatport.com/genre/house/5' },
        release: { id: 99, slug: 'rel-foo', name: 'Foo EP' },
      }
      const out = beatportTrackTransform(input)
      assert.strictEqual(out.id, '12345')
      assert.strictEqual(out.title, 'Foo')
      assert.strictEqual(out.url, 'https://www.beatport.com/track/foo-bar/12345')
      assert.deepStrictEqual(out.artists, [
        { id: '1', name: 'Alice', url: 'https://www.beatport.com/artist/a-one/1', role: 'author' },
      ])
      assert.strictEqual(out.duration_ms, 360000)
      assert.ok(!('version' in out) || out.version === undefined)
    },

    'keeps a non-trivial mix_name as version': () => {
      const out = beatportTrackTransform({
        id: 1,
        slug: 's',
        name: 'Foo',
        mix_name: 'Extended Mix',
        length_ms: 0,
        artists: [],
        remixers: [],
      })
      assert.strictEqual(out.version, 'Extended Mix')
    },
  },

  'bandcampTagTracksTransform': {
    'projects to a list of {id} entries from Bandcamp tag-feed payloads': () => {
      const out = bandcampTagTracksTransform([
        { item_id: 1, title: 'Foo' },
        { item_id: 2, title: 'Bar' },
      ])
      assert.deepStrictEqual(out, [{ id: 1 }, { id: 2 }])
    },
  },

  'bandcampReleasesTransform': {
    'keeps the subdomain as the artist id/url and emits no label on an artist page': () => {
      const [track] = bandcampReleasesTransform([
        release({ url: 'https://ivylab.bandcamp.com/album/blonde-e-p', pageType: 'artist', pageName: 'Ivy Lab' }),
      ])
      assert.deepStrictEqual(track.artists, [
        { name: 'Ivy Lab', role: 'author', id: 'ivylab', url: 'https://ivylab.bandcamp.com' },
      ])
      assert.strictEqual(track.label, null)
    },

    'does not give artists the label subdomain on a label page (prevents merging)': () => {
      const [track] = bandcampReleasesTransform([
        release({
          url: 'https://fokuzrecordings.bandcamp.com/album/early-haze-96-ep',
          artist: 'Fokuz Recordings',
          pageType: 'label',
          pageName: 'Fokuz Recordings',
          trackinfo: [{ id: 12, title: 'SATL - Time Lapse', artist: null, file: { 'mp3-128': 'x' }, duration: 200 }],
        }),
      ])
      assert.deepStrictEqual(track.artists, [{ name: 'SATL', role: 'author', id: null, url: null }])
      assert.deepStrictEqual(track.label, {
        id: '777',
        url: 'https://fokuzrecordings.bandcamp.com',
        name: 'Fokuz Recordings',
      })
    },

    'drops the label name as an artist when a real track artist is present': () => {
      const [withReal, intro] = bandcampReleasesTransform([
        release({
          url: 'https://fokuzrecordings.bandcamp.com/album/early-haze-96-ep',
          artist: 'Fokuz Recordings',
          pageType: 'label',
          pageName: 'Fokuz Recordings',
          trackinfo: [
            { id: 13, title: 'SATL - Time Lapse', artist: 'Fokuz Recordings', file: { 'mp3-128': 'x' }, duration: 200 },
            { id: 14, title: 'Untitled', artist: null, file: { 'mp3-128': 'x' }, duration: 50 },
          ],
        }),
      ])
      assert.deepStrictEqual(withReal.artists, [{ name: 'SATL', role: 'author', id: null, url: null }])
      assert.deepStrictEqual(intro.artists, [{ name: 'Fokuz Recordings', role: 'author', id: null, url: null }])
    },
  },
})
