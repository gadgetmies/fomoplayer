'use strict'

const assert = require('assert')
const {
  FEED_SHAPE_MESSAGE,
  FeedShapeError,
  isJsonContentType,
  assertJsonContentType,
  parseFeedPage,
} = require('../src/js/content/bandcamp/feed-parse')

describe('parseFeedPage', () => {
  it('returns filtered nr releases and the next olderThan on a happy-path response', () => {
    const feed = {
      stories: {
        oldest_story_date: 1700000000,
        entries: [
          { story_type: 'nr', id: 'a' },
          { story_type: 'fav', id: 'b' },
          { story_type: 'nr', id: 'c' },
        ],
      },
    }
    const { releases, nextOlderThan } = parseFeedPage(feed)
    assert.deepStrictEqual(releases.map((r) => r.id), ['a', 'c'])
    assert.strictEqual(nextOlderThan, 1700000000)
  })

  it('throws FeedShapeError (not TypeError) when feed.stories is missing', () => {
    assert.throws(
      () => parseFeedPage({}),
      (err) => err instanceof FeedShapeError && err.message === FEED_SHAPE_MESSAGE,
    )
  })

  it('throws FeedShapeError when feed.stories is null', () => {
    assert.throws(() => parseFeedPage({ stories: null }), FeedShapeError)
  })

  it('throws FeedShapeError when feed.stories.entries is not an array', () => {
    assert.throws(() => parseFeedPage({ stories: { entries: null } }), FeedShapeError)
    assert.throws(() => parseFeedPage({ stories: { entries: 'oops' } }), FeedShapeError)
    assert.throws(() => parseFeedPage({ stories: { entries: { 0: 'x' } } }), FeedShapeError)
  })

  it('does not raise TypeError before the typed error', () => {
    try {
      parseFeedPage(undefined)
      assert.fail('expected throw')
    } catch (err) {
      assert.strictEqual(err.name, 'FeedShapeError')
    }
  })
})

describe('isJsonContentType / assertJsonContentType', () => {
  it('accepts plain application/json', () => {
    assert.strictEqual(isJsonContentType('application/json'), true)
  })

  it('accepts application/json with charset parameter and casing variants', () => {
    assert.strictEqual(isJsonContentType('application/json; charset=utf-8'), true)
    assert.strictEqual(isJsonContentType('Application/JSON;charset=UTF-8'), true)
    assert.strictEqual(isJsonContentType('  application/json  '), true)
  })

  it('rejects HTML and missing content-types', () => {
    assert.strictEqual(isJsonContentType('text/html; charset=utf-8'), false)
    assert.strictEqual(isJsonContentType(''), false)
    assert.strictEqual(isJsonContentType(null), false)
    assert.strictEqual(isJsonContentType(undefined), false)
  })

  it('throws FeedShapeError from assertJsonContentType when the type is wrong', () => {
    assert.throws(() => assertJsonContentType('text/html; charset=utf-8'), FeedShapeError)
    assert.throws(() => assertJsonContentType(null), FeedShapeError)
  })

  it('does not throw from assertJsonContentType when the type is JSON', () => {
    assert.doesNotThrow(() => assertJsonContentType('application/json'))
    assert.doesNotThrow(() => assertJsonContentType('application/json; charset=utf-8'))
  })
})
