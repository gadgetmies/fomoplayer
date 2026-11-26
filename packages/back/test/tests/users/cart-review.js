'use strict'
const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')
const BPromise = require('bluebird')
const { expect } = require('chai')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')
const { initDb, pg } = require('../../lib/db')
const { startServer } = require('../../lib/server')
const { createTestApiKey } = require('../../lib/api-key')
const { createApiKey } = require('../../../db/api-key')
const { addBandcampTracks, addNewBeatportTracksToDb, teardownTracks } = require('../../lib/tracks')

// Cart review: each cart track is to review (no decision), accepted or rejected, and each cart has a review switch.
// Only the cart's owner sees or changes them. The fixture cart holds three Bandcamp tracks and two Beatport tracks.

const readMigration = (name) =>
  fs.readFileSync(path.resolve(__dirname, '../../../migrations/sqls', name), 'utf8')

const bandcampTrack = (index) => ({
  id: String(920000200 + index),
  url: `https://example.bandcamp.com/track/cart-review-${index}`,
  title: `cart review ${index}`,
  version: null,
  duration_ms: 180000,
  released: '2026-04-01T12:00:00Z',
  published: '2026-04-01T12:00:00Z',
  track_number: 1,
  isrc: null,
  artists: [
    {
      name: `cart review artist ${index}`,
      role: 'author',
      id: `cart-review-artist-${index}`,
      url: `https://cart-review-${index}.bandcamp.com`,
    },
  ],
  release: {
    id: `cart-review-release-${index}`,
    url: `https://example.bandcamp.com/album/cart-review-${index}`,
    title: `cart review release ${index}`,
    release_date: '2026-04-01T12:00:00Z',
    catalog_number: null,
    isrc: null,
  },
  previews: [
    { format: 'mp3', url: `https://example.bandcamp.com/preview/cart-review-${index}.mp3`, start_ms: 0, end_ms: 180000 },
  ],
})

const beatportFixtures = ['noisia_block_control_beatport.json', 'noisia_concussion_beatport.json'].map((file) =>
  require(`../../fixtures/${file}`),
)

const makeRequest = (baseUrl, headers) => async (method, path, body) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  return { status: res.status, json }
}

const logIn = async (baseUrl) => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'testuser', password: 'testpwd' }),
  })
  expect(res.status).to.equal(204)
  return res.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ')
}

const cartTrackIds = async (cartId) =>
  (
    await pg.queryRowsAsync(sql`SELECT track_id FROM track__cart WHERE cart_id = ${cartId} ORDER BY track__cart_added DESC`)
  ).map(({ track_id }) => track_id)

const cartRows = async (cartId) =>
  pg.queryRowsAsync(sql`
    SELECT track_id AS "trackId", track__cart_added AS "addedAt", track__cart_review_state AS state
    FROM track__cart WHERE cart_id = ${cartId} ORDER BY track__cart_added DESC`)

const createCart = async (req, name) => {
  const created = await req('POST', '/api/me/carts', { name })
  expect(created.status).to.equal(200)
  return created.json
}

test({
  setup: async () => {
    await initDb()
    const { server, port } = await startServer()
    const baseUrl = `http://localhost:${port}`
    const { raw, userId } = await createTestApiKey()
    const req = makeRequest(baseUrl, { Authorization: `Bearer ${raw}` })
    const anonymous = makeRequest(baseUrl, {})
    const session = makeRequest(baseUrl, { Cookie: await logIn(baseUrl) })

    const [{ id: otherUserId }] = await pg.queryRowsAsync(
      sql`INSERT INTO meta_account DEFAULT VALUES RETURNING meta_account_user_id AS id`,
    )
    const otherRaw = `fp_${randomUUID()}`
    await createApiKey(otherUserId, otherRaw, 'Cart review other user')
    const otherUser = makeRequest(baseUrl, { Authorization: `Bearer ${otherRaw}` })

    const bandcamp = await addBandcampTracks([0, 1, 2].map(bandcampTrack), [userId])
    const bandcampIds = []
    for (const index of [0, 1, 2]) {
      const [{ track_id }] = await pg.queryRowsAsync(
        sql`SELECT track_id FROM store__track WHERE store__track_store_id = ${String(920000200 + index)}`,
      )
      bandcampIds.push(track_id)
    }
    const beatportIds = []
    const beatportSources = []
    for (const fixture of beatportFixtures) {
      const { sourceId, addedTracks } = await addNewBeatportTracksToDb(fixture, false, [userId])
      beatportSources.push(sourceId)
      beatportIds.push(...addedTracks)
    }
    expect(beatportIds).to.have.length(2)

    const cart = await createCart(req, 'cart review fixture')
    const [b0, b1, b2] = bandcampIds
    const [p0, p1] = beatportIds
    // Newest first: b0, p0, b1, p1, b2.
    const order = [b0, p0, b1, p1, b2]

    // Puts the fixture cart back to its five tracks, all to review, review off.
    const resetCart = async (states = {}) => {
      await pg.queryAsync(sql`DELETE FROM track__cart WHERE cart_id = ${cart.id}`)
      for (const [i, trackId] of order.entries()) {
        await pg.queryAsync(sql`
          INSERT INTO track__cart (cart_id, track_id, track__cart_added, track__cart_review_state)
          VALUES (${cart.id}, ${trackId}, NOW() - (${i + 1} * INTERVAL '1 hour'), ${states[trackId] ?? null})`)
      }
      await pg.queryAsync(sql`UPDATE cart SET cart_is_in_review = FALSE, cart_is_public = TRUE WHERE cart_id = ${cart.id}`)
    }
    await resetCart()

    return {
      server,
      req,
      anonymous,
      session,
      otherUser,
      otherUserId,
      userId,
      cart,
      resetCart,
      ids: { b0, b1, b2, p0, p1 },
      order,
      extraCarts: [],
      addedTracks: [...bandcamp.addedTracks, ...beatportIds],
      addedSources: [bandcamp.sourceId, ...beatportSources],
    }
  },

  teardown: async (ctx) => {
    ctx.server.kill()
    const cartIds = [ctx.cart.id, ...ctx.extraCarts]
    await pg.queryAsync(sql`DELETE FROM track__cart WHERE cart_id = ANY(${cartIds})`)
    await pg.queryAsync(sql`DELETE FROM cart WHERE cart_id = ANY(${cartIds})`)
    await pg.queryAsync(sql`DELETE FROM api_key WHERE meta_account_user_id = ${ctx.otherUserId}`)
    await pg.queryAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id = ${ctx.otherUserId}`)
    await teardownTracks(ctx)
  },

  'the migration leaves existing cart tracks to review and every cart out of review (rolled back)': async ({ cart }) => {
    const ROLLBACK = new Error('__rollback__')
    try {
      await BPromise.using(pg.getTransaction(), async (tx) => {
        await tx.queryAsync(readMigration('20261125160000-add-cart-review-down.sql'))
        await tx.queryAsync(readMigration('20261125160000-add-cart-review-up.sql'))
        const states = await tx.queryRowsAsync(
          sql`SELECT DISTINCT track__cart_review_state AS state FROM track__cart WHERE cart_id = ${cart.id}`,
        )
        expect(states).to.deep.equal([{ state: null }])
        const [{ inReview }] = await tx.queryRowsAsync(
          sql`SELECT cart_is_in_review AS "inReview" FROM cart WHERE cart_id = ${cart.id}`,
        )
        expect(inReview).to.equal(false)
        let error
        try {
          await tx.queryAsync('SAVEPOINT invalid_state')
          await tx.queryAsync(sql`UPDATE track__cart SET track__cart_review_state = 'maybe' WHERE cart_id = ${cart.id}`)
        } catch (e) {
          error = e
          await tx.queryAsync('ROLLBACK TO SAVEPOINT invalid_state')
        }
        expect(error?.constraint).to.equal('track__cart_review_state_valid')
        throw ROLLBACK
      })
    } catch (e) {
      if (e !== ROLLBACK) throw e
    }
  },

  'cart pages for the owner': {
    'carry every track as to review and the counts of the whole cart': async ({ req, cart, resetCart }) => {
      await resetCart()
      const { status, json } = await req('GET', `/api/me/carts/${cart.id}`)
      expect(status).to.equal(200)
      expect(json.tracks.map(({ reviewState }) => reviewState)).to.deep.equal([null, null, null, null, null])
      expect(json.cart.review).to.deep.equal({
        enabled: false,
        counts: { toReview: 5, accepted: 0, rejected: 0, all: 5 },
        storeCounts: [
          { store: 'Bandcamp', count: 3 },
          { store: 'Beatport', count: 2 },
        ],
      })
    },

    'page through one review state, newest first, with page.total counting that state': async (ctx) => {
      const { req, cart, resetCart, ids } = ctx
      await resetCart({ [ids.b0]: 'accepted', [ids.p1]: 'accepted', [ids.b1]: 'rejected' })

      const accepted = await req('GET', `/api/me/carts/${cart.id}?review=accepted`)
      expect(accepted.json.tracks.map(({ id }) => id)).to.deep.equal([ids.b0, ids.p1])
      expect(accepted.json.tracks.map(({ reviewState }) => reviewState)).to.deep.equal(['accepted', 'accepted'])
      expect(accepted.json.page.total).to.equal(2)

      const toReview = await req('GET', `/api/me/carts/${cart.id}?review=to-review&offset=1&limit=1`)
      expect(toReview.json.tracks.map(({ id }) => id)).to.deep.equal([ids.b2])
      expect(toReview.json.page.total).to.equal(2)
      expect(toReview.json.cart.review.counts).to.deep.equal({ toReview: 2, accepted: 2, rejected: 1, all: 5 })
    },

    'combine the review and store filters; the store narrows the counts but not the store counts': async (ctx) => {
      const { req, cart, resetCart, ids } = ctx
      await resetCart({ [ids.b0]: 'accepted', [ids.p1]: 'rejected', [ids.b1]: 'rejected' })
      const { json } = await req('GET', `/api/me/carts/${cart.id}?review=rejected&store=bandcamp`)
      expect(json.tracks.map(({ id }) => id)).to.deep.equal([ids.b1])
      expect(json.page.total).to.equal(1)
      expect(json.cart.review.counts).to.deep.equal({ toReview: 1, accepted: 1, rejected: 1, all: 3 })
      expect(json.cart.review.storeCounts).to.deep.equal([
        { store: 'Bandcamp', count: 3 },
        { store: 'Beatport', count: 2 },
      ])
    },

    'are the same through the shared cart link when the owner is logged in': async (ctx) => {
      const { session, cart, resetCart, ids } = ctx
      await resetCart({ [ids.p0]: 'accepted' })
      const { status, json } = await session('GET', `/api/carts/${cart.uuid}?review=accepted`)
      expect(status).to.equal(200)
      expect(json.tracks.map(({ id }) => id)).to.deep.equal([ids.p0])
      expect(json.cart.review.counts.accepted).to.equal(1)
    },

    'refuse an unknown review filter': async ({ req, session, cart }) => {
      expect((await req('GET', `/api/me/carts/${cart.id}?review=maybe`)).status).to.equal(400)
      expect((await session('GET', `/api/carts/${cart.uuid}?review=maybe`)).status).to.equal(400)
    },
  },

  'a public cart seen by anyone else carries no review fields and ignores the review filter': async (ctx) => {
    const { anonymous, cart, resetCart, ids, order } = ctx
    await resetCart({ [ids.b0]: 'accepted', [ids.b1]: 'rejected' })
    const { status, json } = await anonymous('GET', `/api/carts/${cart.uuid}?review=accepted`)
    expect(status).to.equal(200)
    expect(json.tracks.map(({ id }) => id)).to.deep.equal(order)
    expect(json.tracks.every((track) => !('reviewState' in track))).to.equal(true)
    expect(json.cart).not.to.have.property('review')
  },

  'the review switch': {
    'is stored with the cart': async ({ req, cart, resetCart }) => {
      await resetCart()
      expect((await req('PUT', `/api/me/carts/${cart.id}/review`, { enabled: true })).status).to.equal(204)
      expect((await req('GET', `/api/me/carts/${cart.id}`)).json.cart.review.enabled).to.equal(true)
      expect((await req('PUT', `/api/me/carts/${cart.id}/review`, { enabled: false })).status).to.equal(204)
      expect((await req('GET', `/api/me/carts/${cart.id}`)).json.cart.review.enabled).to.equal(false)
    },

    'refuses a value that is not true or false': async ({ req, cart }) => {
      expect((await req('PUT', `/api/me/carts/${cart.id}/review`, { enabled: 'yes' })).status).to.equal(400)
    },

    'refuses another user': async ({ req, otherUser, cart, resetCart }) => {
      await resetCart()
      expect((await otherUser('PUT', `/api/me/carts/${cart.id}/review`, { enabled: true })).status).to.equal(403)
      expect((await req('GET', `/api/me/carts/${cart.id}`)).json.cart.review.enabled).to.equal(false)
    },
  },

  'setting a track review state': {
    'saves it and answers with the counts for the store filter': async ({ req, cart, resetCart, ids }) => {
      await resetCart()
      const all = await req('PUT', `/api/me/carts/${cart.id}/tracks/${ids.p0}/review`, { state: 'accepted' })
      expect(all.status).to.equal(200)
      expect(all.json.counts).to.deep.equal({ toReview: 4, accepted: 1, rejected: 0, all: 5 })
      const beatport = await req('PUT', `/api/me/carts/${cart.id}/tracks/${ids.p1}/review?store=beatport`, {
        state: 'rejected',
      })
      expect(beatport.json.counts).to.deep.equal({ toReview: 0, accepted: 1, rejected: 1, all: 2 })
      const rows = await cartRows(cart.id)
      expect(rows.find(({ trackId }) => trackId === ids.p0).state).to.equal('accepted')
      expect(rows.find(({ trackId }) => trackId === ids.p1).state).to.equal('rejected')
    },

    'back to undecided clears the decision': async ({ req, cart, resetCart, ids }) => {
      await resetCart({ [ids.b0]: 'accepted' })
      const { status } = await req('PUT', `/api/me/carts/${cart.id}/tracks/${ids.b0}/review`, { state: null })
      expect(status).to.equal(200)
      expect((await cartRows(cart.id)).find(({ trackId }) => trackId === ids.b0).state).to.equal(null)
    },

    'keeps the same track in another cart to review': async (ctx) => {
      const { req, cart, resetCart, ids, extraCarts } = ctx
      await resetCart()
      const other = await createCart(req, 'cart review second cart')
      extraCarts.push(other.id)
      await req('PATCH', `/api/me/carts/${other.id}/tracks`, [{ op: 'add', trackId: ids.b0 }])
      await req('PUT', `/api/me/carts/${cart.id}/tracks/${ids.b0}/review`, { state: 'accepted' })
      expect((await cartRows(other.id)).map(({ state }) => state)).to.deep.equal([null])
    },

    'answers 404 for a track that is not in the cart and 400 for an unknown state': async (ctx) => {
      const { req, cart, resetCart, ids } = ctx
      await resetCart()
      await pg.queryAsync(sql`DELETE FROM track__cart WHERE cart_id = ${cart.id} AND track_id = ${ids.b2}`)
      expect((await req('PUT', `/api/me/carts/${cart.id}/tracks/${ids.b2}/review`, { state: 'accepted' })).status).to.equal(
        404,
      )
      expect((await req('PUT', `/api/me/carts/${cart.id}/tracks/${ids.b0}/review`, { state: 'maybe' })).status).to.equal(
        400,
      )
    },

    'refuses another user and leaves the state unchanged': async ({ otherUser, cart, resetCart, ids }) => {
      await resetCart()
      const { status } = await otherUser('PUT', `/api/me/carts/${cart.id}/tracks/${ids.b0}/review`, {
        state: 'rejected',
      })
      expect(status).to.equal(403)
      expect((await cartRows(cart.id)).find(({ trackId }) => trackId === ids.b0).state).to.equal(null)
    },
  },

  'the accepted tracks with their store links': {
    'cover the whole cart, newest first, one entry per accepted track': async ({ req, cart, resetCart, ids }) => {
      await resetCart({ [ids.b0]: 'accepted', [ids.p0]: 'accepted', [ids.b2]: 'accepted', [ids.b1]: 'rejected' })
      const { status, json } = await req('GET', `/api/me/carts/${cart.id}/accepted`)
      expect(status).to.equal(200)
      expect(json.map(({ trackId }) => trackId)).to.deep.equal([ids.b0, ids.p0, ids.b2])
      expect(json[0].links).to.deep.equal([
        { store: 'Bandcamp', url: 'https://example.bandcamp.com/track/cart-review-0' },
      ])
      expect(json[1].links.map(({ store }) => store)).to.deep.equal(['Beatport'])
      expect(json[1].links[0].url).to.match(/^https:\/\/www\.beatport\.com\/track\//)
    },

    'follow the store filter': async ({ req, cart, resetCart, ids }) => {
      await resetCart({ [ids.b0]: 'accepted', [ids.p0]: 'accepted' })
      const { json } = await req('GET', `/api/me/carts/${cart.id}/accepted?store=beatport`)
      expect(json.map(({ trackId }) => trackId)).to.deep.equal([ids.p0])
    },

    'fall back to the release page when the track has no store page': async ({ req, cart, resetCart, ids }) => {
      await resetCart({ [ids.b1]: 'accepted' })
      const [{ details }] = await pg.queryRowsAsync(
        sql`SELECT track_details AS details FROM track_details WHERE track_id = ${ids.b1}`,
      )
      const withoutUrl = { ...details, stores: details.stores.map((store) => ({ ...store, url: null })) }
      await pg.queryAsync(
        sql`UPDATE track_details SET track_details = ${JSON.stringify(withoutUrl)}::JSON WHERE track_id = ${ids.b1}`,
      )
      try {
        const { json } = await req('GET', `/api/me/carts/${cart.id}/accepted`)
        expect(json[0].links).to.deep.equal([
          { store: 'Bandcamp', url: 'https://example.bandcamp.com/album/cart-review-1' },
        ])
      } finally {
        await pg.queryAsync(
          sql`UPDATE track_details SET track_details = ${JSON.stringify(details)}::JSON WHERE track_id = ${ids.b1}`,
        )
      }
    },

    'refuse another user': async ({ otherUser, cart }) => {
      expect((await otherUser('GET', `/api/me/carts/${cart.id}/accepted`)).status).to.equal(403)
    },
  },

  'the accepted tracks can be moved to another cart, and Undo puts them back accepted': async (ctx) => {
    const { req, cart, resetCart, ids, extraCarts } = ctx
    await resetCart({ [ids.b0]: 'accepted', [ids.p1]: 'accepted', [ids.b1]: 'rejected' })
    const target = await createCart(req, 'Buy next week')
    extraCarts.push(target.id)
    const before = await cartRows(cart.id)

    const { status, json } = await req('POST', `/api/me/carts/${cart.id}/accepted`, {
      action: 'move',
      targetCartId: target.id,
    })
    expect(status).to.equal(200)
    expect(json.count).to.equal(2)
    expect(await cartTrackIds(cart.id)).to.deep.equal([ids.p0, ids.b1, ids.b2])
    expect((await cartRows(target.id)).map(({ state }) => state)).to.deep.equal([null, null])

    expect((await req('POST', `/api/me/carts/${cart.id}/accepted/undo`, json.undo)).status).to.equal(204)
    expect(await cartRows(cart.id)).to.deep.equal(before)
    expect(await cartRows(target.id)).to.deep.equal([])
  },

  'the rejected tracks': {
    'can be removed from the cart and put back with Undo': async ({ req, cart, resetCart, ids }) => {
      await resetCart({ [ids.b0]: 'rejected', [ids.p1]: 'rejected', [ids.b2]: 'accepted' })
      const before = await cartRows(cart.id)
      const { status, json } = await req('POST', `/api/me/carts/${cart.id}/rejected`, { action: 'remove' })
      expect(status).to.equal(200)
      expect(json.count).to.equal(2)
      expect(json.targetCart).to.equal(null)
      expect(await cartTrackIds(cart.id)).to.deep.equal([ids.p0, ids.b1, ids.b2])

      const undo = await req('POST', `/api/me/carts/${cart.id}/rejected/undo`, json.undo)
      expect(undo.status).to.equal(204)
      expect(await cartRows(cart.id)).to.deep.equal(before)
    },

    'can be moved to another cart, where tracks it already held stay unchanged, and Undo reverts only the move':
      async (ctx) => {
        const { req, cart, resetCart, ids, extraCarts } = ctx
        await resetCart({ [ids.b0]: 'rejected', [ids.p0]: 'rejected', [ids.b1]: 'rejected' })
        const target = await createCart(req, 'To check later')
        extraCarts.push(target.id)
        await pg.queryAsync(sql`
          INSERT INTO track__cart (cart_id, track_id, track__cart_added, track__cart_review_state)
          VALUES (${target.id}, ${ids.p0}, NOW() - INTERVAL '10 days', 'accepted')`)
        const targetBefore = await cartRows(target.id)
        const before = await cartRows(cart.id)

        const { json } = await req('POST', `/api/me/carts/${cart.id}/rejected`, {
          action: 'move',
          targetCartId: target.id,
        })
        expect(json.count).to.equal(3)
        expect(json.targetCart).to.deep.include({ id: target.id, name: 'To check later' })
        expect(await cartTrackIds(cart.id)).to.deep.equal([ids.p1, ids.b2])
        const moved = await cartRows(target.id)
        expect(moved.map(({ trackId }) => trackId).sort()).to.deep.equal([ids.b0, ids.b1, ids.p0].sort())
        expect(moved.find(({ trackId }) => trackId === ids.p0)).to.deep.equal(targetBefore[0])
        expect(moved.filter(({ trackId }) => trackId !== ids.p0).map(({ state }) => state)).to.deep.equal([null, null])

        expect((await req('POST', `/api/me/carts/${cart.id}/rejected/undo`, json.undo)).status).to.equal(204)
        expect(await cartRows(cart.id)).to.deep.equal(before)
        expect(await cartRows(target.id)).to.deep.equal(targetBefore)
      },

    'can be moved to a new cart named in the request': async ({ req, cart, resetCart, ids, extraCarts, userId }) => {
      await resetCart({ [ids.b2]: 'rejected' })
      const { json } = await req('POST', `/api/me/carts/${cart.id}/rejected`, {
        action: 'move',
        newCartName: 'Rejected from review',
      })
      extraCarts.push(json.targetCart.id)
      expect(json.targetCart.name).to.equal('Rejected from review')
      const [{ owner }] = await pg.queryRowsAsync(
        sql`SELECT meta_account_user_id AS owner FROM cart WHERE cart_id = ${json.targetCart.id}`,
      )
      expect(owner).to.equal(userId)
      expect(await cartTrackIds(json.targetCart.id)).to.deep.equal([ids.b2])
    },

    'follow the store filter': async ({ req, cart, resetCart, ids }) => {
      await resetCart({ [ids.b0]: 'rejected', [ids.p0]: 'rejected' })
      const { json } = await req('POST', `/api/me/carts/${cart.id}/rejected?store=bandcamp`, { action: 'remove' })
      expect(json.count).to.equal(1)
      expect(await cartTrackIds(cart.id)).to.include(ids.p0)
      expect(await cartTrackIds(cart.id)).not.to.include(ids.b0)
    },

    'refuse an unknown action, a missing target and another user': async (ctx) => {
      const { req, otherUser, cart, resetCart, ids } = ctx
      await resetCart({ [ids.b0]: 'rejected' })
      expect((await req('POST', `/api/me/carts/${cart.id}/rejected`, { action: 'burn' })).status).to.equal(400)
      expect((await req('POST', `/api/me/carts/${cart.id}/rejected`, { action: 'move' })).status).to.equal(400)
      expect((await otherUser('POST', `/api/me/carts/${cart.id}/rejected`, { action: 'remove' })).status).to.equal(403)
      const undo = { sourceCartId: cart.id, tracks: [{ trackId: ids.b1, addedAt: new Date().toISOString() }] }
      expect((await otherUser('POST', `/api/me/carts/${cart.id}/rejected/undo`, undo)).status).to.equal(403)
      expect(await cartTrackIds(cart.id)).to.include(ids.b0)
    },

    'refuse a move to a cart of another user': async (ctx) => {
      const { req, cart, resetCart, ids, otherUserId, extraCarts } = ctx
      await resetCart({ [ids.b0]: 'rejected' })
      const [{ id: foreignCartId }] = await pg.queryRowsAsync(
        sql`INSERT INTO cart (cart_name, meta_account_user_id) VALUES ('foreign', ${otherUserId}) RETURNING cart_id AS id`,
      )
      extraCarts.push(foreignCartId)
      const { status } = await req('POST', `/api/me/carts/${cart.id}/rejected`, {
        action: 'move',
        targetCartId: foreignCartId,
      })
      expect(status).to.equal(403)
      expect(await cartTrackIds(cart.id)).to.include(ids.b0)
      expect(await cartTrackIds(foreignCartId)).to.deep.equal([])
    },
  },
})
