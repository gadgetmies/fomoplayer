'use strict'

const assert = require('assert')
const { test } = require('cascade-test')
const {
  installBrowserStub,
  clearBrowserStub,
  fetchMock,
  reloadCartPushModules,
} = require('../lib/cart-push-stubs')

// Each test installs a fresh browser stub + re-requires the cart-push
// modules so they pick up the new `global.browser`. We can't rely on
// suite-level setup because cascade-test's setup runs once per suite,
// not once per test, and our tests need pristine `cartPushRun` storage.
const freshModules = () => {
  installBrowserStub()
  reloadCartPushModules()
  const state = require('../../src/js/cart-push/state')
  const beatport = require('../../src/js/cart-push/beatport')
  beatport.__resetLoopGuardForTests()
  return { state, beatport }
}

const cleanup = () => {
  clearBrowserStub()
  reloadCartPushModules()
}

const sessionHandler = (token = 'tk-1') => ({
  match: (url) => url === 'https://www.beatport.com/api/auth/session',
  respond: () => ({ body: token === null ? {} : { token: { accessToken: token } } }),
})

const sessionFailHandler = () => ({
  match: (url) => url === 'https://www.beatport.com/api/auth/session',
  respond: () => ({ ok: false, status: 401, body: 'unauthorized', contentType: 'text/plain' }),
})

const listCartsHandler = (carts) => ({
  match: (url, init) =>
    url === 'https://api.beatport.com/v4/my/carts/' && (!init.method || init.method === 'GET'),
  respond: () => ({ body: carts }),
})

const createCartHandler = (createdCart) => ({
  match: (url, init) => url === 'https://api.beatport.com/v4/my/carts/' && init.method === 'POST',
  respond: () => ({ body: createdCart }),
})

const createCartFailHandler = (status = 500) => ({
  match: (url, init) => url === 'https://api.beatport.com/v4/my/carts/' && init.method === 'POST',
  respond: () => ({ ok: false, status, body: 'denied', contentType: 'text/plain' }),
})

const cartItemsHandler = (cartId, items) => ({
  match: (url) => url === `https://api.beatport.com/v4/my/carts/${cartId}/?items=true`,
  respond: () => ({ body: { items: items.map((item_id) => ({ item_id })) } }),
})

const postItemHandler = (cartId, behavior) => ({
  match: (url, init) =>
    url === `https://api.beatport.com/v4/my/carts/${cartId}/items/` && init.method === 'POST',
  respond: (url, init) => {
    const body = JSON.parse(init.body)
    return behavior(body.item_id)
  },
})

const makeDeps = (fetchFn, cart) => ({
  fetch: fetchFn,
  apiFetch: async () => cart,
  getAppUrl: async () => 'https://fomoplayer.test',
})

test({
  'Beatport cart-push flow': {
    '(a) cart not found → creates FOMO: <name> cart': async () => {
      const { state, beatport } = freshModules()
      try {
        const cart = {
          name: 'set-1',
          tracks: [
            { id: 10, title: 'A', artists: [{ name: 'Alice' }], stores: [{ code: 'beatport', trackId: '100' }] },
          ],
        }
        const created = { id: 42, name: 'FOMO: set-1' }
        const fetch = fetchMock([
          sessionHandler(),
          listCartsHandler([]),
          createCartHandler(created),
          cartItemsHandler(42, []),
          postItemHandler(42, () => ({ body: {} })),
        ])
        await beatport.startBeatportRun({ fomoplayerCartId: 7 }, makeDeps(fetch, cart))
        const run = await state.readRun()
        assert.strictEqual(run.status, state.RunStatus.COMPLETED)
        assert.strictEqual(run.beatportCartId, 42)
        assert.strictEqual(run.results.added.length, 1)
        const createCalls = fetch.calls.filter((c) => c.init?.method === 'POST' && c.url.endsWith('/my/carts/'))
        assert.strictEqual(createCalls.length, 1)
      } finally {
        cleanup()
      }
    },

    '(b) cart found → reuses existing cart, no create call': async () => {
      const { state, beatport } = freshModules()
      try {
        const cart = {
          name: 'set-2',
          tracks: [
            { id: 11, title: 'B', artists: [{ name: 'B' }], stores: [{ code: 'beatport', trackId: '200' }] },
          ],
        }
        const existing = { id: 99, name: 'FOMO: set-2' }
        const fetch = fetchMock([
          sessionHandler(),
          listCartsHandler([existing]),
          cartItemsHandler(99, []),
          postItemHandler(99, () => ({ body: {} })),
        ])
        await beatport.startBeatportRun({ fomoplayerCartId: 7 }, makeDeps(fetch, cart))
        const run = await state.readRun()
        assert.strictEqual(run.beatportCartId, 99)
        const createCalls = fetch.calls.filter((c) => c.init?.method === 'POST' && c.url.endsWith('/my/carts/'))
        assert.strictEqual(createCalls.length, 0)
      } finally {
        cleanup()
      }
    },

    '(c) tracks bucket-classified: added / alreadyInCart / notOnStore / failed': async () => {
      const { state, beatport } = freshModules()
      try {
        const cart = {
          name: 'set-3',
          tracks: [
            { id: 1, title: 'will-add', artists: [{ name: 'A' }], stores: [{ code: 'beatport', trackId: '300' }] },
            { id: 2, title: 'in-cart', artists: [{ name: 'A' }], stores: [{ code: 'beatport', trackId: '400' }] },
            { id: 3, title: 'no-bp', artists: [{ name: 'A' }], stores: [{ code: 'bandcamp', url: 'https://x.bc/track/y' }] },
            { id: 4, title: 'fails', artists: [{ name: 'A' }], stores: [{ code: 'beatport', trackId: '500' }] },
          ],
        }
        const fetch = fetchMock([
          sessionHandler(),
          listCartsHandler([{ id: 7, name: 'FOMO: set-3' }]),
          cartItemsHandler(7, [400]),
          postItemHandler(7, (itemId) =>
            itemId === 500
              ? { ok: false, status: 403, body: 'denied', contentType: 'text/plain' }
              : { body: {} },
          ),
        ])
        await beatport.startBeatportRun({ fomoplayerCartId: 9 }, makeDeps(fetch, cart))
        const run = await state.readRun()
        assert.strictEqual(run.results.added.length, 1)
        assert.strictEqual(run.results.added[0].itemId, 300)
        assert.strictEqual(run.results.alreadyInCart.length, 1)
        assert.strictEqual(run.results.alreadyInCart[0].itemId, 400)
        assert.strictEqual(run.results.notOnStore.length, 1)
        assert.strictEqual(run.results.notOnStore[0].trackId, 3)
        assert.strictEqual(run.results.failed.length, 1)
        assert.strictEqual(run.results.failed[0].status, 403)
        assert.strictEqual(run.status, state.RunStatus.COMPLETED)
      } finally {
        cleanup()
      }
    },

    '(d) resumeBeatportRun picks up at the right index from half-processed storage': async () => {
      const { state, beatport } = freshModules()
      try {
        const partial = {
          runId: 'r1',
          store: 'beatport',
          fomoplayerCartId: 1,
          fomoplayerCartName: 'half',
          beatportCartId: 50,
          beatportCartName: 'FOMO: half',
          status: state.RunStatus.RUNNING,
          startedAt: new Date().toISOString(),
          completedAt: null,
          queue: [
            { trackId: 1, itemId: 1001, artist: 'A', title: 'T1', fomoplayerUrl: '' },
            { trackId: 2, itemId: 1002, artist: 'A', title: 'T2', fomoplayerUrl: '' },
            { trackId: 3, itemId: 1003, artist: 'A', title: 'T3', fomoplayerUrl: '' },
          ],
          processed: 2,
          results: {
            added: [
              { trackId: 1, itemId: 1001, artist: 'A', title: 'T1', fomoplayerUrl: '' },
              { trackId: 2, itemId: 1002, artist: 'A', title: 'T2', fomoplayerUrl: '' },
            ],
            alreadyInCart: [],
            notOnStore: [],
            failed: [],
          },
        }
        await state.replaceRun(partial)
        const fetch = fetchMock([
          sessionHandler(),
          postItemHandler(50, () => ({ body: {} })),
        ])
        await beatport.resumeBeatportRun({ fetch })
        const run = await state.readRun()
        assert.strictEqual(run.processed, 3)
        assert.strictEqual(run.status, state.RunStatus.COMPLETED)
        const posts = fetch.calls.filter((c) => c.init?.method === 'POST')
        assert.strictEqual(posts.length, 1)
        assert.strictEqual(JSON.parse(posts[0].init.body).item_id, 1003)
      } finally {
        cleanup()
      }
    },

    '(e) create-cart non-2xx terminates with the documented message': async () => {
      const { state, beatport } = freshModules()
      try {
        const cart = {
          name: 'no-go',
          tracks: [
            { id: 10, title: 'A', artists: [{ name: 'A' }], stores: [{ code: 'beatport', trackId: '1' }] },
          ],
        }
        const fetch = fetchMock([
          sessionHandler(),
          listCartsHandler([]),
          createCartFailHandler(500),
        ])
        await beatport.startBeatportRun({ fomoplayerCartId: 7 }, makeDeps(fetch, cart))
        const run = await state.readRun()
        assert.strictEqual(run.status, state.RunStatus.FAILED)
        assert.match(run.error, /Could not create FOMO cart on Beatport/)
        assert.match(run.error, /FOMO: no-go/)
      } finally {
        cleanup()
      }
    },

    '(f) auth-session non-2xx terminates with "Not logged in to Beatport"': async () => {
      const { state, beatport } = freshModules()
      try {
        const cart = { name: 'x', tracks: [] }
        const fetch = fetchMock([sessionFailHandler()])
        await beatport.startBeatportRun({ fomoplayerCartId: 7 }, makeDeps(fetch, cart))
        const run = await state.readRun()
        assert.strictEqual(run.status, state.RunStatus.FAILED)
        assert.strictEqual(run.error, 'Not logged in to Beatport')
        assert.strictEqual(fetch.calls.length, 1)
      } finally {
        cleanup()
      }
    },
  },
})
