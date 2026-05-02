'use strict'

const assert = require('assert')
const { beatportTrackTransform } = require('../src/js/transforms/beatport')
const { bandcampTagTracksTransform } = require('../src/js/transforms/bandcamp')

describe('beatportTrackTransform', () => {
  it('maps a Beatport track payload to the canonical shape', () => {
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
    assert.deepStrictEqual(out.artists, [{ id: '1', name: 'Alice', url: 'https://www.beatport.com/artist/a-one/1', role: 'author' }])
    assert.strictEqual(out.duration_ms, 360000)
    // 'Original Mix' should be erased by `removeOriginalMix`.
    assert.ok(!('version' in out) || out.version === undefined)
  })

  it('keeps a non-trivial mix_name as version', () => {
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
  })
})

describe('bandcampTagTracksTransform', () => {
  it('projects to a list of {id} entries from Bandcamp tag-feed payloads', () => {
    const out = bandcampTagTracksTransform([
      { item_id: 1, title: 'Foo' },
      { item_id: 2, title: 'Bar' },
    ])
    assert.deepStrictEqual(out, [{ id: 1 }, { id: 2 }])
  })
})
