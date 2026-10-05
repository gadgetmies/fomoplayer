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
  beatportTrackTransform: {
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

    'maps the genre and the v4 sub_genre': () => {
      const out = beatportTrackTransform({
        id: 1,
        slug: 's',
        name: 'Foo',
        artists: [],
        remixers: [],
        genre: { id: 1, name: 'Drum & Bass', slug: 'drum-bass', url: 'https://api.beatport.com/v4/catalog/genres/1/' },
        sub_genre: { id: 7, name: 'Liquid', slug: 'liquid', url: 'https://api.beatport.com/v4/catalog/sub-genres/7/' },
      })
      assert.deepStrictEqual(out.genres, [
        { name: 'Drum & Bass', id: 'genres/1', url: 'https://api.beatport.com/v4/catalog/genres/1/' },
        { name: 'Liquid', id: 'sub-genres/7', url: 'https://api.beatport.com/v4/catalog/sub-genres/7/' },
      ])
    },

    'maps the legacy page-props subgenre key': () => {
      const out = beatportTrackTransform({
        id: 1,
        slug: 's',
        name: 'Foo',
        artists: [],
        remixers: [],
        genre: { id: 5, name: 'House', slug: 'house', url: 'u1' },
        subgenre: { id: 12, name: 'Disco House', slug: 'disco-house', url: 'u2' },
      })
      assert.deepStrictEqual(
        out.genres.map(({ id }) => id),
        ['genres/5', 'sub-genres/12'],
      )
    },

    'keys genre and sub-genre ids apart, as Beatport numbers them separately': () => {
      const out = beatportTrackTransform({
        id: 1,
        slug: 's',
        name: 'Foo',
        artists: [],
        remixers: [],
        genre: { id: 107, name: 'Pop', slug: 'pop', url: 'u1' },
        sub_genre: { id: 107, name: 'Pop', slug: 'pop', url: 'u2' },
      })
      assert.deepStrictEqual(
        out.genres.map(({ id }) => id),
        ['genres/107', 'sub-genres/107'],
      )
    },

    'skips a genre without an id rather than keying it by slug': () => {
      const out = beatportTrackTransform({
        id: 1,
        slug: 's',
        name: 'Foo',
        artists: [],
        remixers: [],
        genre: { name: 'House', slug: 'house', url: 'u1' },
      })
      assert.deepStrictEqual(out.genres, [])
    },

    'skips null genre and sub_genre': () => {
      const out = beatportTrackTransform({
        id: 1,
        slug: 's',
        name: 'Foo',
        artists: [],
        remixers: [],
        genre: { id: 5, name: 'House', slug: 'house', url: 'u1' },
        sub_genre: null,
      })
      assert.deepStrictEqual(out.genres, [{ name: 'House', id: 'genres/5', url: 'u1' }])
    },
  },

  bandcampTagTracksTransform: {
    'projects to a list of {id} entries from Bandcamp tag-feed payloads': () => {
      const out = bandcampTagTracksTransform([
        { item_id: 1, title: 'Foo' },
        { item_id: 2, title: 'Bar' },
      ])
      assert.deepStrictEqual(out, [{ id: 1 }, { id: 2 }])
    },
  },

  bandcampReleasesTransform: {
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

    'remixes': {
      'keeps the author of a self-remix': () => {
        const [track] = bandcampReleasesTransform([
          release({
            url: 'https://hospitalrecords.bandcamp.com/album/hospital30-2',
            artist: 'Hospital Records',
            pageType: 'label',
            pageName: 'Hospital Records',
            trackinfo: [
              {
                id: 21,
                title: 'Cyantific - Ghetto Blaster (Cyantific Remix)',
                artist: 'Cyantific',
                file: { 'mp3-128': 'x' },
                duration: 200,
              },
            ],
          }),
        ])
        assert.strictEqual(track.title, 'Ghetto Blaster')
        assert.strictEqual(track.version, 'Cyantific Remix')
        assert.deepStrictEqual(track.artists, [
          { name: 'Cyantific', role: 'author', id: null, url: null },
          { name: 'Cyantific', role: 'remixer', id: null, url: null },
        ])
      },

      'still drops a remixer listed among several authors': () => {
        const [track] = bandcampReleasesTransform([
          release({
            url: 'https://hospitalrecords.bandcamp.com/album/hospital30-2',
            artist: 'Hospital Records',
            pageType: 'label',
            pageName: 'Hospital Records',
            trackinfo: [
              {
                id: 22,
                title: 'Emz, Nasser, Valor, Hoax - Free (Hoax Remix)',
                artist: 'Emz, Nasser, Valor, Hoax',
                file: { 'mp3-128': 'x' },
                duration: 200,
              },
            ],
          }),
        ])
        assert.deepStrictEqual(
          track.artists.map(({ name, role }) => `${name}:${role}`),
          ['Emz:author', 'Nasser:author', 'Valor:author', 'Hoax:remixer'],
        )
      },

      'keeps an artist named like its own label as the author and as a remixer': () => {
        const [ganjaPeople, saveOurSoul] = bandcampReleasesTransform([
          release({
            url: 'https://sl8rdnb.bandcamp.com/album/rough-grooves-ep-2',
            artist: 'Sl8r & Duality',
            pageType: 'label',
            pageName: 'Sl8r',
            trackinfo: [
              {
                id: 23,
                title: 'Sl8r - Ganja People (Duality Remix)',
                artist: 'Sl8r',
                file: { 'mp3-128': 'x' },
                duration: 200,
              },
              {
                id: 24,
                title: 'Duality - Save Our Soul (Sl8r Remix)',
                artist: 'Duality',
                file: { 'mp3-128': 'x' },
                duration: 200,
              },
            ],
          }),
        ])
        assert.deepStrictEqual(
          ganjaPeople.artists.map(({ name, role }) => `${name}:${role}`),
          ['Sl8r:author', 'Duality:remixer'],
        )
        assert.deepStrictEqual(
          saveOurSoul.artists.map(({ name, role }) => `${name}:${role}`),
          ['Duality:author', 'Sl8r:remixer'],
        )
      },

      'reads the authors after a remixer prefix': () => {
        const [track] = bandcampReleasesTransform([
          release({
            url: 'https://phace.bandcamp.com/track/noisia-phace-cannonball-emperor-remix',
            artist: 'Emperor',
            pageType: 'artist',
            pageName: 'phace',
            trackinfo: [
              {
                id: 25,
                title: 'Emperor - Noisia & Phace - Cannonball (Emperor Remix)',
                artist: 'Emperor',
                file: { 'mp3-128': 'x' },
                duration: 200,
              },
            ],
          }),
        ])
        assert.strictEqual(track.title, 'Cannonball')
        assert.deepStrictEqual(
          track.artists.map(({ name, role }) => `${name}:${role}`),
          ['Noisia:author', 'Phace:author', 'Emperor:remixer'],
        )
      },

      'keeps the release artist as the author of a compilation remix with no other artist': () => {
        const [track] = bandcampReleasesTransform([
          release({
            url: 'https://fokuzrecordings.bandcamp.com/album/heaven-in-me-sampler',
            artist: 'Various Artists',
            pageType: 'label',
            pageName: 'Fokuz Recordings',
            trackinfo: [
              { id: 26, title: 'Heaven In Me (Outer Bass Remix)', artist: null, file: { 'mp3-128': 'x' }, duration: 200 },
            ],
          }),
        ])
        assert.deepStrictEqual(
          track.artists.map(({ name, role }) => `${name}:${role}`),
          ['Various Artists:author', 'Outer Bass:remixer'],
        )
      },
    },
  },
})
