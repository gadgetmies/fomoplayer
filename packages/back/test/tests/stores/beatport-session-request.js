/**
 * Tests for the session-request.js module that replaced request-in-session.
 *
 * Verifies that:
 * - initWithSession creates a working session object with pre-seeded cookies
 * - The session object exposes get/getJson/postJson/deleteJson/getBlob methods
 * - Cookie headers are sent with requests
 * - postJson and deleteJson include X-CSRFToken header from cookie jar
 */
const assert = require('assert')
const { test } = require('cascade-test')
const { initWithSession } = require('../../../routes/stores/beatport/session-request')

// Wraps the callback-based initWithSession in a promise for cleaner tests
const initWithSessionAsync = (cookies, uri) =>
  new Promise((resolve, reject) =>
    initWithSession(cookies, uri, (err, session) => (err ? reject(err) : resolve(session))),
  )

// Replaces global.fetch with a spy, runs fn, then restores the original
const withFetchMock = async (responseOverride, fn) => {
  const calls = []
  const origFetch = global.fetch
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return {
      status: responseOverride.status ?? 200,
      ok: responseOverride.ok ?? true,
      text: async () => responseOverride.text ?? 'ok',
      json: async () => responseOverride.json ?? {},
      arrayBuffer: async () => responseOverride.arrayBuffer ?? new ArrayBuffer(0),
      headers: { get: () => null },
    }
  }
  try {
    await fn(calls)
  } finally {
    global.fetch = origFetch
  }
}

// Wraps session callback methods in promises
const sessionGet = (session, uri) =>
  new Promise((resolve, reject) => session.get(uri, (err, body) => (err ? reject(err) : resolve(body))))

const sessionGetJson = (session, uri) =>
  new Promise((resolve, reject) => session.getJson(uri, (err, json) => (err ? reject(err) : resolve(json))))

const sessionPostJson = (session, uri, json) =>
  new Promise((resolve, reject) => session.postJson(uri, json, (err, body) => (err ? reject(err) : resolve(body))))

const sessionDeleteJson = (session, uri, json) =>
  new Promise((resolve, reject) => session.deleteJson(uri, json, (err, body) => (err ? reject(err) : resolve(body))))

test({
  'initWithSession creates a session object with all required methods': async () => {
    const session = await initWithSessionAsync(
      { session: 'abc', _csrf_token: 'tok' },
      'https://www.beatport.com/',
    )
    assert.ok(session)
    assert.strictEqual(typeof session.get, 'function')
    assert.strictEqual(typeof session.getJson, 'function')
    assert.strictEqual(typeof session.postJson, 'function')
    assert.strictEqual(typeof session.deleteJson, 'function')
    assert.strictEqual(typeof session.getBlob, 'function')
  },

  'session.get sends Cookie header with seeded cookies': async () => {
    await withFetchMock({ text: 'page body' }, async (calls) => {
      const session = await initWithSessionAsync(
        { session: 'mysession', _csrf_token: 'mytoken' },
        'https://www.beatport.com/',
      )
      const body = await sessionGet(session, 'https://www.beatport.com/api/my-beatport')
      assert.strictEqual(body, 'page body')
      const lastCall = calls[calls.length - 1]
      const cookieHeader = lastCall.options?.headers?.Cookie
      assert.ok(cookieHeader, 'Cookie header must be set')
      assert.ok(cookieHeader.includes('session=mysession'), 'Cookie header must include the session cookie')
    })
  },

  'session.getJson sends Cookie header and parses JSON response': async () => {
    await withFetchMock({ json: { tracks: [1, 2, 3] } }, async (calls) => {
      const session = await initWithSessionAsync({ session: 'mysession' }, 'https://www.beatport.com/')
      const json = await sessionGetJson(session, 'https://www.beatport.com/api/cart/cart')
      assert.deepStrictEqual(json, { tracks: [1, 2, 3] })
    })
  },

  'session.postJson sends POST with X-CSRFToken and JSON body': async () => {
    await withFetchMock({ json: { ok: true } }, async (calls) => {
      const session = await initWithSessionAsync(
        { session: 'ses', _csrf_token: 'csrf123' },
        'https://www.beatport.com/',
      )
      await sessionPostJson(session, 'https://www.beatport.com/api/cart/1', {
        items: [{ type: 'track', id: 99 }],
      })
      const postCall = calls[calls.length - 1]
      assert.strictEqual(postCall.options.method, 'POST')
      assert.ok(postCall.options.headers['X-CSRFToken'], 'X-CSRFToken header must be present')
      assert.strictEqual(
        postCall.options.body,
        JSON.stringify({ items: [{ type: 'track', id: 99 }] }),
      )
    })
  },

  'session.deleteJson sends DELETE with X-CSRFToken and JSON body': async () => {
    await withFetchMock({ json: { ok: true } }, async (calls) => {
      const session = await initWithSessionAsync(
        { session: 'ses', _csrf_token: 'csrf123' },
        'https://www.beatport.com/',
      )
      await sessionDeleteJson(session, 'https://www.beatport.com/api/cart/1', {
        items: [{ type: 'track', id: 99 }],
      })
      const deleteCall = calls[calls.length - 1]
      assert.strictEqual(deleteCall.options.method, 'DELETE')
      assert.ok(deleteCall.options.headers['X-CSRFToken'], 'X-CSRFToken must be present on DELETE')
    })
  },
})
