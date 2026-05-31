const assert = require('assert')
const { test } = require('cascade-test')
const {
  detectArtistNameIssues,
  detectIssueKinds,
  suggestCleanedName,
} = require('../../../routes/admin/artist-name-issue-logic')

test({
  'detectIssueKinds': {
    'flags leading feat.': () => assert.deepStrictEqual(detectIssueKinds('feat. Foo'), ['feat']),
    'flags trailing feat. tail': () => assert.deepStrictEqual(detectIssueKinds('Foo feat. Bar'), ['feat']),
    'flags ft. short form': () => assert.deepStrictEqual(detectIssueKinds('Foo ft. Bar'), ['feat']),
    'flags featuring': () => assert.deepStrictEqual(detectIssueKinds('Foo featuring Bar'), ['feat']),
    'flags trailing Remix': () => assert.deepStrictEqual(detectIssueKinds('Foo Remix'), ['versionTag']),
    'flags parenthetical Remix': () =>
      assert.deepStrictEqual(detectIssueKinds('Foo (Bar Remix)'), ['versionTag', 'parenthetical']),
    'flags bracketed text': () => assert.deepStrictEqual(detectIssueKinds('Foo [Premiere]'), ['parenthetical']),
    'flags wrapped name': () => assert.deepStrictEqual(detectIssueKinds('(Foo)'), ['parenthetical']),
    'flags leading whitespace': () => assert.deepStrictEqual(detectIssueKinds(' Foo'), ['whitespace']),
    'flags trailing whitespace': () => assert.deepStrictEqual(detectIssueKinds('Foo '), ['whitespace']),
    'flags double space': () => assert.deepStrictEqual(detectIssueKinds('Foo  Bar'), ['whitespace']),
    'flags trailing comma': () => assert.deepStrictEqual(detectIssueKinds('Foo,'), ['whitespace']),
    'flags trailing dangling ampersand': () => assert.deepStrictEqual(detectIssueKinds('Foo &'), ['whitespace']),
    'clean single name yields no kinds': () => assert.deepStrictEqual(detectIssueKinds('Aphex Twin'), []),
    'compound name with internal & is clean': () =>
      assert.deepStrictEqual(detectIssueKinds('Camo & Krooked'), []),
    'does not match feat inside a word': () =>
      assert.deepStrictEqual(detectIssueKinds('Featherweight'), []),
    'does not match remix inside a word': () => assert.deepStrictEqual(detectIssueKinds('Remixer'), []),
    'does not match edit inside a word': () => assert.deepStrictEqual(detectIssueKinds('Credit Card'), []),
    'handles empty / null': () => {
      assert.deepStrictEqual(detectIssueKinds(''), [])
      assert.deepStrictEqual(detectIssueKinds(null), [])
    },
  },
  'suggestCleanedName': {
    'strips trailing parenthetical': () =>
      assert.strictEqual(suggestCleanedName('Foo (Bar Remix)'), 'Foo'),
    'strips trailing bracketed': () => assert.strictEqual(suggestCleanedName('Foo [Premiere]'), 'Foo'),
    'strips feat. tail': () => assert.strictEqual(suggestCleanedName('Foo feat. Bar'), 'Foo'),
    'strips featuring tail': () => assert.strictEqual(suggestCleanedName('Foo featuring Bar & Baz'), 'Foo'),
    'strips leading feat. prefix': () => assert.strictEqual(suggestCleanedName('feat. Bar'), 'Bar'),
    'strips leading ft. prefix': () => assert.strictEqual(suggestCleanedName('ft. Bar'), 'Bar'),
    'strips trailing Remix word': () => assert.strictEqual(suggestCleanedName('Foo Remix'), 'Foo'),
    'collapses internal whitespace': () => assert.strictEqual(suggestCleanedName('Foo  Bar'), 'Foo Bar'),
    'trims edge whitespace': () => assert.strictEqual(suggestCleanedName(' Foo '), 'Foo'),
    'strips dangling trailing comma': () => assert.strictEqual(suggestCleanedName('Foo,'), 'Foo'),
    'handles compound pollution': () =>
      assert.strictEqual(suggestCleanedName('Foo (feat. Bar) (VIP)'), 'Foo'),
    'returns empty when only junk': () => assert.strictEqual(suggestCleanedName('(   )'), ''),
    'leaves clean names unchanged': () =>
      assert.strictEqual(suggestCleanedName('Camo & Krooked'), 'Camo & Krooked'),
    'handles empty / null': () => {
      assert.strictEqual(suggestCleanedName(''), '')
      assert.strictEqual(suggestCleanedName(null), '')
    },
  },
  'detectArtistNameIssues': {
    'returns null for a clean name': () => assert.strictEqual(detectArtistNameIssues('Aphex Twin'), null),
    'returns kinds and suggestion for polluted name': () =>
      assert.deepStrictEqual(detectArtistNameIssues('Foo (Bar Remix)'), {
        kinds: ['versionTag', 'parenthetical'],
        suggestedName: 'Foo',
      }),
    'returns null suggestion when cleanup yields an empty name': () =>
      // "(Foo)" wraps the whole name; the trailing-bracket strip leaves an
      // empty string, so the admin has to type the cleaned name themselves.
      assert.deepStrictEqual(detectArtistNameIssues('(Foo)'), {
        kinds: ['parenthetical'],
        suggestedName: null,
      }),
  },
})
