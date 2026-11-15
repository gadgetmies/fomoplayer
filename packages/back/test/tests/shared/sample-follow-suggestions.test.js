const assert = require('assert')
const { test } = require('cascade-test')
const { tallyFollowSuggestions } = require('../../../routes/shared/db/sample-similarity.js')

const track = (artistIds, labelIds) => ({
  artists: artistIds.map((id) => ({ id, name: `Artist ${id}` })),
  labels: labelIds.map((id) => ({ id, name: `Label ${id}` })),
})

const none = { artistIds: new Set(), labelIds: new Set() }
const keys = (follow) => follow.map(({ type, id }) => `${type}:${id}`)

test({
  'the most frequent artist comes first with its count': () => {
    const follow = tallyFollowSuggestions([track([1], [10]), track([1], [11]), track([2], [10])], none)
    assert.deepStrictEqual(follow[0], { type: 'artist', id: 1, name: 'Artist 1', count: 2, followed: false })
  },

  'artists come before labels on equal counts': () => {
    const follow = tallyFollowSuggestions([track([1], [10])], none)
    assert.deepStrictEqual(keys(follow), ['artist:1', 'label:10'])
  },

  'followed artists and labels do not take a place in the five': () => {
    // Counts: artist 1 ×6, artist 2 ×5, label 10 ×4, artist 3 ×3, artist 4 ×2, artist 5 ×1, label 11 ×1
    const tracks = [
      track([1, 2, 3, 4, 5], [10, 11]),
      track([1, 2, 3, 4], [10]),
      track([1, 2, 3], [10]),
      track([1, 2], [10]),
      track([1, 2], []),
      track([1], []),
    ]
    const follow = tallyFollowSuggestions(tracks, { artistIds: new Set([1, 2]), labelIds: new Set([10]) })
    assert.deepStrictEqual(keys(follow), ['artist:3', 'artist:4', 'artist:5', 'label:11'])
    assert.ok(follow.every(({ followed }) => followed === false))
  },

  'at most five suggestions are returned': () => {
    const follow = tallyFollowSuggestions([track([1, 2, 3, 4, 5, 6], [10, 11])], none)
    assert.strictEqual(follow.length, 5)
  },
})
