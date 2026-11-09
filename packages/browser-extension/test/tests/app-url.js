'use strict'

const assert = require('assert')
const { test } = require('cascade-test')
const { normalizeAppUrl } = require('../../src/js/app-url')

test({
  normalizeAppUrl: {
    'strips a single trailing slash': async () => {
      assert.strictEqual(normalizeAppUrl('https://app.fomoplayer.test/'), 'https://app.fomoplayer.test')
    },
    'strips multiple trailing slashes': async () => {
      assert.strictEqual(normalizeAppUrl('https://app.fomoplayer.test///'), 'https://app.fomoplayer.test')
    },
    'leaves a slash-free URL unchanged': async () => {
      assert.strictEqual(normalizeAppUrl('https://app.fomoplayer.test'), 'https://app.fomoplayer.test')
    },
    'does not strip slashes from a path segment, only the trailing one': async () => {
      assert.strictEqual(normalizeAppUrl('https://app.fomoplayer.test/sub/'), 'https://app.fomoplayer.test/sub')
    },
    'trims surrounding whitespace': async () => {
      assert.strictEqual(normalizeAppUrl('  https://app.fomoplayer.test/  '), 'https://app.fomoplayer.test')
    },
    'handles null/undefined as empty string': async () => {
      assert.strictEqual(normalizeAppUrl(undefined), '')
      assert.strictEqual(normalizeAppUrl(null), '')
    },
  },
})
