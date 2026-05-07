const assert = require('assert')
const { test } = require('cascade-test')

const { isSafeRedirectPath, isSafeHandoffTarget, evaluateHandoffTarget } = require('../../../../routes/shared/safe-redirect')

const BASE = 'https://app.example.com'
const PREVIEW_A = 'https://preview-a.example.com'
const PREVIEW_B = 'https://preview-b.example.com'

const PR_PREVIEW_REGEXES = [/^https:\/\/fomoplayer-fomoplayer-pr-\d+\.up\.railway\.app$/i]

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

test({
  'isSafeHandoffTarget — accepts URL whose origin matches a configured regex': () => {
    assert.strictEqual(
      isSafeHandoffTarget('https://fomoplayer-fomoplayer-pr-158.up.railway.app', PR_PREVIEW_REGEXES),
      true,
    )
  },

  'isSafeHandoffTarget — any PR number matches the example regex': () => {
    assert.strictEqual(
      isSafeHandoffTarget('https://fomoplayer-fomoplayer-pr-1.up.railway.app', PR_PREVIEW_REGEXES),
      true,
    )
    assert.strictEqual(
      isSafeHandoffTarget('https://fomoplayer-fomoplayer-pr-99999.up.railway.app', PR_PREVIEW_REGEXES),
      true,
    )
  },

  'isSafeHandoffTarget — non-PR Railway URL is rejected by the example regex': () => {
    assert.strictEqual(
      isSafeHandoffTarget('https://fomoplayer-fomoplayer.up.railway.app', PR_PREVIEW_REGEXES),
      false,
    )
  },

  'isSafeHandoffTarget — different project name is rejected': () => {
    assert.strictEqual(
      isSafeHandoffTarget('https://other-project-pr-1.up.railway.app', PR_PREVIEW_REGEXES),
      false,
    )
  },

  'isSafeHandoffTarget — pattern is anchored: cannot prepend to bypass': () => {
    assert.strictEqual(
      isSafeHandoffTarget('https://evil.fomoplayer-fomoplayer-pr-1.up.railway.app', PR_PREVIEW_REGEXES),
      false,
    )
  },

  'isSafeHandoffTarget — pattern is anchored: cannot append to bypass': () => {
    assert.strictEqual(
      isSafeHandoffTarget('https://fomoplayer-fomoplayer-pr-1.up.railway.app.evil.com', PR_PREVIEW_REGEXES),
      false,
    )
  },

  'isSafeHandoffTarget — http:// is rejected by an https-only regex': () => {
    assert.strictEqual(
      isSafeHandoffTarget('http://fomoplayer-fomoplayer-pr-1.up.railway.app', PR_PREVIEW_REGEXES),
      false,
    )
  },

  'isSafeHandoffTarget — non-integer PR suffix is rejected': () => {
    assert.strictEqual(
      isSafeHandoffTarget('https://fomoplayer-fomoplayer-pr-abc.up.railway.app', PR_PREVIEW_REGEXES),
      false,
    )
  },

  'isSafeHandoffTarget — empty allowlist rejects every URL': () => {
    assert.strictEqual(
      isSafeHandoffTarget('https://fomoplayer-fomoplayer-pr-1.up.railway.app', []),
      false,
    )
    assert.strictEqual(
      isSafeHandoffTarget('https://fomoplayer-fomoplayer-pr-1.up.railway.app'),
      false,
    )
  },

  'isSafeHandoffTarget — null URL is rejected': () => {
    assert.strictEqual(isSafeHandoffTarget(null, PR_PREVIEW_REGEXES), false)
  },
})

test({
  'evaluateHandoffTarget — accepts a URL matching the configured regex': () => {
    assert.deepStrictEqual(
      evaluateHandoffTarget('https://fomoplayer-fomoplayer-pr-1.up.railway.app', PR_PREVIEW_REGEXES),
      { ok: true },
    )
  },

  'evaluateHandoffTarget — flags allowlist-not-configured when regex list is empty': () => {
    assert.deepStrictEqual(
      evaluateHandoffTarget('https://fomoplayer-fomoplayer-pr-1.up.railway.app', []),
      { ok: false, subReason: 'allowlist-not-configured' },
    )
  },

  'evaluateHandoffTarget — flags allowlist-not-configured when regex list is undefined': () => {
    assert.deepStrictEqual(
      evaluateHandoffTarget('https://fomoplayer-fomoplayer-pr-1.up.railway.app'),
      { ok: false, subReason: 'allowlist-not-configured' },
    )
  },

  'evaluateHandoffTarget — flags origin-not-allowed when regex matches nothing': () => {
    assert.deepStrictEqual(
      evaluateHandoffTarget('https://other-project-pr-1.up.railway.app', PR_PREVIEW_REGEXES),
      { ok: false, subReason: 'origin-not-allowed' },
    )
  },

  'evaluateHandoffTarget — flags origin-not-allowed for http when regex requires https': () => {
    assert.deepStrictEqual(
      evaluateHandoffTarget('http://fomoplayer-fomoplayer-pr-1.up.railway.app', PR_PREVIEW_REGEXES),
      { ok: false, subReason: 'origin-not-allowed' },
    )
  },

  'evaluateHandoffTarget — flags missing URL': () => {
    assert.deepStrictEqual(
      evaluateHandoffTarget(null, PR_PREVIEW_REGEXES),
      { ok: false, subReason: 'missing-or-invalid-url' },
    )
  },

  'evaluateHandoffTarget — flags malformed URL when regex is set': () => {
    assert.deepStrictEqual(
      evaluateHandoffTarget('not a url', PR_PREVIEW_REGEXES),
      { ok: false, subReason: 'missing-or-invalid-url' },
    )
  },

  'evaluateHandoffTarget — accepts the first matching regex from a list': () => {
    const regexes = [
      /^https:\/\/staging\.example\.com$/,
      /^https:\/\/fomoplayer-fomoplayer-pr-\d+\.up\.railway\.app$/i,
    ]
    assert.deepStrictEqual(
      evaluateHandoffTarget('https://fomoplayer-fomoplayer-pr-7.up.railway.app', regexes),
      { ok: true },
    )
  },
})
