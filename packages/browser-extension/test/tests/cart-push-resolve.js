'use strict'

const assert = require('assert')
const { test } = require('cascade-test')
const { resolveCartTracks } = require('../../src/js/cart-push/resolve')
const { CART_PAGE_SIZE } = require('../../src/js/cart-tracks')
const { cartResponse } = require('../lib/cart-response')

const makeApiFetch = (cart) => async (path) => {
  if (!path.startsWith('/api/me/carts/')) throw new Error('unexpected path ' + path)
  return cartResponse(cart)
}

const makeDeps = (cart) => ({
  apiFetch: makeApiFetch(cart),
  getAppUrl: async () => 'https://fomoplayer.test',
})

const track = (id, title, artists, stores) => ({ id, title, artists, stores })

test({
  'resolveCartTracks': {
    'Beatport and Bandcamp present — both queues populated': async () => {
      const cart = {
        name: 'my-set',
        tracks: [
          track(1, 'A', [{ name: 'Alice' }], [
            { code: 'beatport', trackId: '12345', url: 'https://www.beatport.com/track/a/12345' },
            { code: 'bandcamp', trackId: 'bc-1', url: 'https://artist.bandcamp.com/track/a' },
          ]),
        ],
      }
      const beatport = await resolveCartTracks({ store: 'beatport', fomoplayerCartId: 7 }, makeDeps(cart))
      assert.strictEqual(beatport.queue.length, 1)
      assert.strictEqual(beatport.queue[0].itemId, 12345)
      assert.strictEqual(beatport.queue[0].artist, 'Alice')
      assert.strictEqual(beatport.notOnStore.length, 0)
      assert.strictEqual(beatport.cartName, 'my-set')
      const bandcamp = await resolveCartTracks({ store: 'bandcamp', fomoplayerCartId: 7 }, makeDeps(cart))
      assert.strictEqual(bandcamp.queue.length, 1)
      assert.strictEqual(bandcamp.queue[0].url, 'https://artist.bandcamp.com/track/a')
    },

    'only Beatport present — bandcamp bucket gets notOnStore entry': async () => {
      const cart = {
        tracks: [
          track(2, 'B', [{ name: 'Bob' }], [
            { code: 'beatport', trackId: '999', url: 'https://www.beatport.com/track/b/999' },
          ]),
        ],
      }
      const bp = await resolveCartTracks({ store: 'beatport', fomoplayerCartId: 1 }, makeDeps(cart))
      assert.deepStrictEqual(bp.queue.map((q) => q.itemId), [999])
      assert.strictEqual(bp.notOnStore.length, 0)
      const bc = await resolveCartTracks({ store: 'bandcamp', fomoplayerCartId: 1 }, makeDeps(cart))
      assert.strictEqual(bc.queue.length, 0)
      assert.strictEqual(bc.notOnStore.length, 1)
      assert.strictEqual(bc.notOnStore[0].trackId, 2)
    },

    'only Bandcamp present — beatport bucket gets notOnStore entry': async () => {
      const cart = {
        tracks: [
          track(3, 'C', [{ name: 'Carol' }], [
            { code: 'bandcamp', url: 'https://artist.bandcamp.com/track/c' },
          ]),
        ],
      }
      const bp = await resolveCartTracks({ store: 'beatport', fomoplayerCartId: 1 }, makeDeps(cart))
      assert.strictEqual(bp.queue.length, 0)
      assert.strictEqual(bp.notOnStore.length, 1)
      const bc = await resolveCartTracks({ store: 'bandcamp', fomoplayerCartId: 1 }, makeDeps(cart))
      assert.strictEqual(bc.queue.length, 1)
      assert.strictEqual(bc.notOnStore.length, 0)
    },

    'neither present — both buckets get notOnStore entry': async () => {
      const cart = { tracks: [track(4, 'D', [{ name: 'Dan' }], [])] }
      const bp = await resolveCartTracks({ store: 'beatport', fomoplayerCartId: 1 }, makeDeps(cart))
      assert.strictEqual(bp.queue.length, 0)
      assert.strictEqual(bp.notOnStore.length, 1)
      const bc = await resolveCartTracks({ store: 'bandcamp', fomoplayerCartId: 1 }, makeDeps(cart))
      assert.strictEqual(bc.queue.length, 0)
      assert.strictEqual(bc.notOnStore.length, 1)
    },

    'fomoplayerUrl points back to the track': async () => {
      const cart = { tracks: [track(42, 'Z', [{ name: 'Z' }], [{ code: 'beatport', trackId: '1' }])] }
      const bp = await resolveCartTracks({ store: 'beatport', fomoplayerCartId: 1 }, makeDeps(cart))
      assert.match(bp.queue[0].fomoplayerUrl, /track(:|%3A)42/)
    },

    'beatport trackId of "0" or empty is not a valid item_id (treat as notOnStore)': async () => {
      const cart = {
        tracks: [
          track(5, 'E', [{ name: 'E' }], [{ code: 'beatport', trackId: '0' }]),
          track(6, 'F', [{ name: 'F' }], [{ code: 'beatport', trackId: '' }]),
        ],
      }
      const bp = await resolveCartTracks({ store: 'beatport', fomoplayerCartId: 1 }, makeDeps(cart))
      assert.strictEqual(bp.queue.length, 0)
      assert.strictEqual(bp.notOnStore.length, 2)
    },

    'reads every page of a cart larger than one page': async () => {
      const all = Array.from({ length: CART_PAGE_SIZE + 3 }, (_, i) =>
        track(i + 1, `T${i}`, [{ name: 'A' }], [{ code: 'beatport', trackId: String(i + 1) }]),
      )
      const paths = []
      const apiFetch = async (path) => {
        paths.push(path)
        const { searchParams } = new URL(path, 'https://fomoplayer.test')
        const offset = Number(searchParams.get('offset'))
        const limit = Number(searchParams.get('limit'))
        return { cart: { name: 'big' }, tracks: all.slice(offset, offset + limit), page: { offset, limit, total: all.length } }
      }
      const bp = await resolveCartTracks(
        { store: 'beatport', fomoplayerCartId: 3 },
        { apiFetch, getAppUrl: async () => 'https://fomoplayer.test' },
      )
      assert.strictEqual(bp.queue.length, all.length)
      assert.strictEqual(paths.length, 2)
    },
  },
})
