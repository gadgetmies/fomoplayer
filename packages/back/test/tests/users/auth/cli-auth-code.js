'use strict'
const assert = require('assert')
const crypto = require('crypto')
const { test } = require('cascade-test')
const { issueCode, consumeCode } = require('../../../../routes/shared/cli-auth-code')

const challengeFor = (verifier) => crypto.createHash('sha256').update(verifier).digest('base64url')

test({
  'consumeCode returns the user id when the verifier matches the challenge': async () => {
    const verifier = 'verifier-1'
    const code = issueCode(42, challengeFor(verifier))
    const result = consumeCode(code, verifier)
    assert.deepStrictEqual(result, { userId: 42 })
  },

  'consumeCode is single-use': async () => {
    const verifier = 'verifier-2'
    const code = issueCode(7, challengeFor(verifier))
    consumeCode(code, verifier)
    assert.strictEqual(consumeCode(code, verifier), null)
  },

  'consumeCode rejects a mismatching verifier': async () => {
    const code = issueCode(1, challengeFor('correct'))
    assert.strictEqual(consumeCode(code, 'wrong'), null)
  },

  'consumeCode succeeds when no redirect_uri was bound and none is supplied': async () => {
    const verifier = 'free'
    const code = issueCode(3, challengeFor(verifier))
    assert.deepStrictEqual(consumeCode(code, verifier, { redirectUri: null }), { userId: 3 })
  },

  'consumeCode succeeds when the bound redirect_uri matches': async () => {
    const verifier = 'bound'
    const redirectUri = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/auth-callback.html'
    const code = issueCode(11, challengeFor(verifier), { boundRedirectUri: redirectUri })
    assert.deepStrictEqual(consumeCode(code, verifier, { redirectUri }), { userId: 11 })
  },

  'consumeCode rejects a tampered redirect_uri': async () => {
    const verifier = 'tampered'
    const bound = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/auth-callback.html'
    const code = issueCode(12, challengeFor(verifier), { boundRedirectUri: bound })
    assert.strictEqual(consumeCode(code, verifier, { redirectUri: 'https://evil.example/' }), null)
  },

  'consumeCode rejects when bound but no redirect_uri provided': async () => {
    const verifier = 'missing'
    const bound = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/auth-callback.html'
    const code = issueCode(13, challengeFor(verifier), { boundRedirectUri: bound })
    assert.strictEqual(consumeCode(code, verifier), null)
  },
})
