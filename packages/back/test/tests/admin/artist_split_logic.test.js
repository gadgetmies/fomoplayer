const assert = require('assert')
const { test } = require('cascade-test')
const { hasSplitSeparators, suggestArtistSplit } = require('../../../routes/admin/artist-split-logic')

test({
  'hasSplitSeparators': {
    'detects ampersand': () => assert.strictEqual(hasSplitSeparators('Sleepnet & Lumen'), true),
    'detects comma with spaces': () => assert.strictEqual(hasSplitSeparators('Tiesto, Hardwell'), true),
    'detects comma without spaces': () => assert.strictEqual(hasSplitSeparators('A,B'), true),
    'detects " x " separator': () => assert.strictEqual(hasSplitSeparators('Unglued x Whiney'), true),
    'detects featuring': () => assert.strictEqual(hasSplitSeparators('Camo & Krooked featuring Rezar'), true),
    'detects feat.': () => assert.strictEqual(hasSplitSeparators('Artist feat. Guest'), true),
    'detects vs.': () => assert.strictEqual(hasSplitSeparators('Foo vs. Bar'), true),
    'detects slash': () => assert.strictEqual(hasSplitSeparators('Foo / Bar'), true),
    'ignores plain single name': () => assert.strictEqual(hasSplitSeparators('Aphex Twin'), false),
    'does not match x inside a word': () => assert.strictEqual(hasSplitSeparators('Mxrcy'), false),
    'does not match and inside a word': () => assert.strictEqual(hasSplitSeparators('Anderson'), false),
    'handles empty / null': () => {
      assert.strictEqual(hasSplitSeparators(''), false)
      assert.strictEqual(hasSplitSeparators(null), false)
    },
  },
  'suggestArtistSplit': {
    'splits on ampersand': () =>
      assert.deepStrictEqual(suggestArtistSplit('Sleepnet & Lumen'), ['Sleepnet', 'Lumen']),
    'splits on " x "': () => assert.deepStrictEqual(suggestArtistSplit('Unglued x Whiney'), ['Unglued', 'Whiney']),
    'splits a compound + featuring into three parts': () =>
      assert.deepStrictEqual(suggestArtistSplit('Camo & Krooked featuring Rezar (Red Bull Symphonic)'), [
        'Camo',
        'Krooked',
        'Rezar (Red Bull Symphonic)',
      ]),
    'splits on comma': () => assert.deepStrictEqual(suggestArtistSplit('A, B, C'), ['A', 'B', 'C']),
    'returns single part for a plain name': () =>
      assert.deepStrictEqual(suggestArtistSplit('Aphex Twin'), ['Aphex Twin']),
    'trims and drops empties': () => assert.deepStrictEqual(suggestArtistSplit('Foo &  & Bar'), ['Foo', 'Bar']),
  },
})
