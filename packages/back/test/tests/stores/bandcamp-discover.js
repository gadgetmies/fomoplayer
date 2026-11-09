const assert = require('assert')
const { test } = require('cascade-test')

const {
  static: { getDiscoverParams, getDiscoverReleaseUrls, getTagsFromUrl },
} = require('../../../routes/stores/bandcamp/bandcamp-api.js')

const paramsFor = (url) => getDiscoverParams(getTagsFromUrl(url))

test({
  'a genre with a sub-genre tag queries both tags': () => {
    const params = paramsFor('https://bandcamp.com/discover/electronic?tags=drum-bass')
    assert.deepEqual(params.tag_norm_names, ['electronic', 'drum-bass'])
    assert.equal(params.category_id, 0)
  },
  'combined tag terms are split on +': () => {
    assert.deepEqual(paramsFor('https://bandcamp.com/discover/bass-music+drum-bass+dubstep').tag_norm_names, [
      'bass-music',
      'drum-bass',
      'dubstep',
    ])
  },
  'the all genre adds no tag': () => {
    assert.deepEqual(paramsFor('https://bandcamp.com/discover/all?tags=jungle').tag_norm_names, ['jungle'])
  },
  'a format path segment selects the matching category': () => {
    assert.equal(paramsFor('https://bandcamp.com/discover/electronic/vinyl').category_id, 2)
    assert.equal(paramsFor('https://bandcamp.com/discover/electronic/cassette').category_id, 4)
  },
  'release urls drop the discover tracking parameter and duplicates': () => {
    const response = {
      results: [
        { item_url: 'https://a.bandcamp.com/album/one?from=discover_page' },
        { item_url: 'https://b.bandcamp.com/track/two?from=discover_page' },
        { item_url: 'https://a.bandcamp.com/album/one?from=discover_page' },
      ],
    }
    assert.deepEqual(getDiscoverReleaseUrls(response), [
      'https://a.bandcamp.com/album/one',
      'https://b.bandcamp.com/track/two',
    ])
  },
  'an empty response has no release urls': () => {
    assert.deepEqual(getDiscoverReleaseUrls({ results: [], cursor: null }), [])
  },
})
