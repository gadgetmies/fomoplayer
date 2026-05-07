const assert = require('assert')
const jwt = require('jsonwebtoken')
const { test } = require('cascade-test')

const {
  StatelessStateStore,
  STATE_TOKEN_AUDIENCE,
  STATE_TOKEN_TTL_SECONDS,
} = require('../../../../routes/shared/oidc-state-store')

const SECRET = 'state-store-test-secret'
const ISSUER = 'https://authority.example.com'

const newStore = (overrides = {}) =>
  new StatelessStateStore({ secret: SECRET, issuer: ISSUER, ...overrides })

const callStore = (store, ctx, appState) =>
  new Promise((resolve, reject) => {
    store.store({}, ctx, appState, {}, (err, handle) => {
      if (err) return reject(err)
      resolve(handle)
    })
  })

const callVerify = (store, handle) =>
  new Promise((resolve) => {
    store.verify({}, handle, (err, ctxOrFalse, info) => {
      if (err) return resolve({ err })
      resolve({ ctxOrFalse, info })
    })
  })

test({
  'constructor throws without secret': () => {
    assert.throws(() => new StatelessStateStore({ issuer: ISSUER }), TypeError)
  },

  'constructor throws without issuer': () => {
    assert.throws(() => new StatelessStateStore({ secret: SECRET }), TypeError)
  },

  'store yields a JWT-shaped handle': async () => {
    const store = newStore()
    const handle = await callStore(store, { nonce: 'n' }, { returnPath: '/x' })
    assert.ok(typeof handle === 'string' && handle.split('.').length === 3, 'expected a 3-part JWT')
  },

  'roundtrip preserves ctx and appState': async () => {
    const store = newStore()
    const ctx = { nonce: 'n', issued: new Date().toISOString() }
    const appState = { returnPath: '/dashboard', handoffTarget: 'https://c.example.com' }
    const handle = await callStore(store, ctx, appState)
    const { ctxOrFalse, info } = await callVerify(store, handle)
    assert.notStrictEqual(ctxOrFalse, false, info?.message)
    assert.strictEqual(ctxOrFalse.nonce, 'n')
    assert.ok(ctxOrFalse.issued instanceof Date, 'ctx.issued is rehydrated to Date')
    assert.deepStrictEqual(info, appState)
  },

  'roundtrip works with null appState': async () => {
    const store = newStore()
    const handle = await callStore(store, {}, null)
    const { ctxOrFalse, info } = await callVerify(store, handle)
    assert.notStrictEqual(ctxOrFalse, false)
    assert.strictEqual(info, null)
  },

  'verify rejects tampered signature': async () => {
    const store = newStore()
    const handle = await callStore(store, {}, { x: 1 })
    const parts = handle.split('.')
    const tampered = `${parts[0]}.${parts[1]}.${'A'.repeat(parts[2].length)}`
    const { ctxOrFalse, info } = await callVerify(store, tampered)
    assert.strictEqual(ctxOrFalse, false)
    assert.ok(info?.message)
  },

  'verify rejects different secret': async () => {
    const a = newStore()
    const b = newStore({ secret: 'other-secret' })
    const handle = await callStore(a, {}, { x: 1 })
    const { ctxOrFalse } = await callVerify(b, handle)
    assert.strictEqual(ctxOrFalse, false)
  },

  'verify rejects different issuer': async () => {
    const a = newStore()
    const b = newStore({ issuer: 'https://other.example.com' })
    const handle = await callStore(a, {}, { x: 1 })
    const { ctxOrFalse } = await callVerify(b, handle)
    assert.strictEqual(ctxOrFalse, false)
  },

  'verify rejects token signed with wrong audience': async () => {
    const store = newStore()
    const wrongAud = jwt.sign({ ctx: {}, appState: {} }, SECRET, {
      algorithm: 'HS256',
      issuer: ISSUER,
      audience: 'something-else',
      expiresIn: STATE_TOKEN_TTL_SECONDS,
    })
    const { ctxOrFalse } = await callVerify(store, wrongAud)
    assert.strictEqual(ctxOrFalse, false)
  },

  'verify rejects expired token': async () => {
    const store = newStore()
    const expired = jwt.sign({ ctx: {}, appState: { x: 1 } }, SECRET, {
      algorithm: 'HS256',
      issuer: ISSUER,
      audience: STATE_TOKEN_AUDIENCE,
      expiresIn: -10,
    })
    const { ctxOrFalse } = await callVerify(store, expired)
    assert.strictEqual(ctxOrFalse, false)
  },

  'verify rejects empty / non-string handle': async () => {
    const store = newStore()
    for (const bad of [null, undefined, '', 42, {}]) {
      const { ctxOrFalse } = await callVerify(store, bad)
      assert.strictEqual(ctxOrFalse, false, `expected rejection for ${JSON.stringify(bad)}`)
    }
  },

  'state TTL is longer than the typical OIDC round trip (>= 1 minute)': () => {
    assert.ok(STATE_TOKEN_TTL_SECONDS >= 60)
  },
})
