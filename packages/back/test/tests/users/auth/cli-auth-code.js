'use strict'
const assert = require('assert')
const crypto = require('crypto')
const { test } = require('cascade-test')
const { issueCode, consumeCode, createUsedChallengeStore } = require('../../../../routes/shared/cli-auth-code')

const challengeFor = (verifier) => crypto.createHash('sha256').update(verifier).digest('base64url')

test({
  'used-challenge store marks a challenge once and reports it as used': async () => {
    const store = createUsedChallengeStore()
    assert.strictEqual(store.isUsed('challenge-a'), false)
    assert.strictEqual(store.markUsed('challenge-a'), true)
    assert.strictEqual(store.isUsed('challenge-a'), true)
    assert.strictEqual(store.markUsed('challenge-a'), false)
    assert.strictEqual(store.isUsed('challenge-b'), false)
  },

  'used-challenge store forgets a challenge after its time to live': async () => {
    let now = 1000
    const store = createUsedChallengeStore({ ttlMs: 50, now: () => now })
    store.markUsed('challenge-a')
    now = 1049
    assert.strictEqual(store.isUsed('challenge-a'), true)
    now = 1050
    assert.strictEqual(store.isUsed('challenge-a'), false)
    assert.strictEqual(store.markUsed('challenge-a'), true)
  },

  'used-challenge store ignores empty or missing challenges': async () => {
    const store = createUsedChallengeStore()
    assert.strictEqual(store.markUsed(undefined), false)
    assert.strictEqual(store.markUsed(''), false)
    assert.strictEqual(store.isUsed(undefined), false)
  },

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
