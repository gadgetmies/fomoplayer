const assert = require('assert')
const { test } = require('cascade-test')

const {
  static: { getTagSlug, getTagUrl, getTagName, getTagsFromUrl },
} = require('../../../routes/stores/bandcamp/bandcamp-api.js')

// Mirrors the result Bandcamp search appends for the query (see logic.search).
const tagPlaylistFor = (query) => {
  const slug = getTagSlug(query)
  if (!slug) return null
  const url = getTagUrl({ genre: slug })
  return { type: 'playlist', id: url, name: getTagName(getTagsFromUrl(url)), url, store: { name: 'bandcamp' } }
}

test({
  'a single-word query becomes a discover tag playlist': () => {
    assert.deepEqual(tagPlaylistFor('jungle'), {
      type: 'playlist',
      id: 'https://bandcamp.com/discover/jungle',
      name: 'Music tagged with jungle',
      url: 'https://bandcamp.com/discover/jungle',
      store: { name: 'bandcamp' },
    })
  },
  'spaces and punctuation are slugified': () => {
    assert.equal(getTagSlug('Drum & Bass'), 'drum-bass')
    assert.equal(getTagSlug('UK Garage!'), 'uk-garage')
  },
  'combined tag terms keep their + separators': () => {
    const result = tagPlaylistFor('bass-music+drum-bass+dubstep')
    assert.equal(result.url, 'https://bandcamp.com/discover/bass-music+drum-bass+dubstep')
    assert.equal(result.name, 'Music tagged with bass-music+drum-bass+dubstep')
  },
  'blank queries produce no playlist': () => {
    assert.equal(getTagSlug('   '), '')
    assert.equal(tagPlaylistFor('   '), null)
  },
  'the produced url round-trips through the tag parser': () => {
    const result = tagPlaylistFor('jungle')
    assert.deepEqual(getTagsFromUrl(result.url), { genre: 'jungle', subgenre: undefined, format: undefined })
  },
})
