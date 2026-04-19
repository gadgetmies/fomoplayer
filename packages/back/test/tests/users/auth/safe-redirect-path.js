const assert = require('assert')
const { test } = require('cascade-test')

const { isSafeRedirectPath } = require('../../../../routes/shared/safe-redirect')

const BASE = 'https://app.example.com'
const PREVIEW_A = 'https://preview-a.example.com'
const PREVIEW_B = 'https://preview-b.example.com'

test({
  'relative path is allowed': () => {
    assert.strictEqual(isSafeRedirectPath('/some/path', BASE), true)
  },

  'root path is allowed': () => {
    assert.strictEqual(isSafeRedirectPath('/', BASE), true)
  },

  'empty string is rejected': () => {
    assert.strictEqual(isSafeRedirectPath('', BASE), false)
  },

  'null is rejected': () => {
    assert.strictEqual(isSafeRedirectPath(null, BASE), false)
  },

  'absolute URL matching single trusted origin is allowed': () => {
    assert.strictEqual(isSafeRedirectPath(`${BASE}/dashboard`, BASE), true)
  },

  'absolute URL matching one of multiple trusted origins is allowed (cross-env preview)': () => {
    assert.strictEqual(isSafeRedirectPath(`${PREVIEW_A}/dashboard`, [PREVIEW_B, PREVIEW_A]), true)
  },

  'absolute URL not in trusted origins list is rejected': () => {
    assert.strictEqual(isSafeRedirectPath('https://evil.com/', [PREVIEW_B, PREVIEW_A]), false)
  },

  'protocol-relative // URL matching trusted origin is allowed': () => {
    assert.strictEqual(isSafeRedirectPath('//app.example.com/path', BASE), true)
  },

  'protocol-relative // URL for different host is rejected': () => {
    assert.strictEqual(isSafeRedirectPath('//evil.com/path', BASE), false)
  },

  'path with backslash is rejected (browser normalisation bypass)': () => {
    assert.strictEqual(isSafeRedirectPath('/\\evil.com', BASE), false)
  },

  'path that does not start with / is rejected': () => {
    assert.strictEqual(isSafeRedirectPath('evil.com', BASE), false)
  },

  'http:// URL for untrusted host is rejected': () => {
    assert.strictEqual(isSafeRedirectPath('http://evil.com/', BASE), false)
  },
})
