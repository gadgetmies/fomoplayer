// Seeding for the cart review playback demo tests. Everything goes through the API with the browser session, so the
// same code seeds the local backend and the deployed preview (which has no DB access), and running it again puts both
// demo carts back to the same state (the preview keeps its data between runs):
//   1. POST /api/me/tracks            six Beatport tracks (upserted by store id), whose previews play a fixture mp3
//   2. POST/PUT/PATCH /api/me/carts   the reviewed cart holding exactly those tracks, newest first in a fixed order,
//                                     and a second cart holding PB2, for the cart menu of PB2's row
//   3. PUT .../review                 PB1 and PB3 accepted, PB4 rejected, the rest to review; review switched off

const path = require('path')
const { beatportTracksTransform } = require('../../../browser-extension/src/js/transforms/beatport')
const { storeUrl: beatportUrl } = require('../../routes/stores/beatport/logic')
const { fetchViaBrowser, ensureOk } = require('./cart-similarity-seed')

const [concussion] = beatportTracksTransform(require('../fixtures/noisia_concussion_beatport.json'))
const { isrc, store_details, ...concussionWithoutIsrc } = concussion

const TOKEN = 'fpcartreviewplayback'
const CART_NAME = 'Cart review playback demo'
const OTHER_CART_NAME = 'Cart review playback other'
const AUDIO_FIXTURE = path.resolve(__dirname, '../fixtures/sample-waveform-demo.mp3')
const PREVIEW_URL_PATTERN = new RegExp(`/${TOKEN}/[a-z0-9]+\\.mp3$`)

// The reviewed cart's rows, newest first, with their review state.
const DEMO_TRACKS = [
  { key: 'PB1', state: 'accepted' },
  { key: 'PB2', state: null },
  { key: 'PB3', state: 'accepted' },
  { key: 'PB4', state: 'rejected' },
  { key: 'PB5', state: null },
  { key: 'PB6', state: null },
]

const titleOf = (key) => `${TOKEN} ${key}`

// A Beatport track with its own ids, so ingestion does not merge it, and a preview the test serves from a fixture.
const beatportTrack = (key, index) => {
  const id = String(990881100 + index)
  return {
    ...concussionWithoutIsrc,
    id,
    title: titleOf(key),
    url: `https://www.beatport.com/track/${TOKEN}-${key.toLowerCase()}/${id}`,
    released: '2026-09-01',
    published: '2026-09-01',
    previews: [
      { format: 'mp3', url: `https://example.com/${TOKEN}/${key.toLowerCase()}.mp3`, start_ms: 0, end_ms: 20000 },
    ],
    release: {
      ...concussion.release,
      isrc: null,
      id,
      title: `${TOKEN} release ${key}`,
      catalog_number: `FPCRP-${key}`,
      url: `https://www.beatport.com/release/${TOKEN}-${key.toLowerCase()}/${id}`,
    },
    artists: [
      {
        name: `Review Playback Artist ${key}`,
        id: String(990881500 + index),
        url: `https://www.beatport.com/artist/review-playback-${key.toLowerCase()}/${990881500 + index}`,
        role: 'author',
      },
    ],
  }
}

const findOrCreateCart = async (page, carts, name) =>
  carts.find((cart) => cart.name === name) ||
  ensureOk(
    `Creating the cart ${name}`,
    await fetchViaBrowser(page, '/api/me/carts', { method: 'POST', body: { name } }),
  ).json

const setCartTracks = async (page, cart, trackIds) => {
  ensureOk(
    `Setting the tracks of ${cart.name}`,
    await fetchViaBrowser(page, `/api/me/carts/${cart.id}/tracks`, { method: 'PUT', body: trackIds }),
  )
  const now = Date.now()
  ensureOk(
    `Ordering the tracks of ${cart.name}`,
    await fetchViaBrowser(page, `/api/me/carts/${cart.id}/tracks`, {
      method: 'PATCH',
      body: trackIds.map((trackId, i) => ({
        op: 'add',
        trackId,
        addedAt: new Date(now - (i + 1) * 60000).toISOString(),
      })),
    }),
  )
}

// Serves the demo tracks' previews from the fixture mp3, so they play the same locally and on the preview.
const serveDemoPreviews = (page) =>
  page.route(PREVIEW_URL_PATTERN, (route) =>
    route.fulfill({ status: 200, path: AUDIO_FIXTURE, headers: { 'content-type': 'audio/mpeg' } }),
  )

module.exports.CART_NAME = CART_NAME
module.exports.OTHER_CART_NAME = OTHER_CART_NAME
module.exports.titleOf = titleOf

module.exports.seedCartReviewPlaybackViaApi = async (page) => {
  await serveDemoPreviews(page)
  const tracks = DEMO_TRACKS.map(({ key }, index) => beatportTrack(key, index))
  const { json } = ensureOk(
    'Seeding the demo tracks',
    await fetchViaBrowser(page, '/api/me/tracks?skipOld=false&return=mapping', {
      method: 'POST',
      body: tracks,
      headers: { 'x-multi-store-player-store': beatportUrl },
    }),
  )
  const ids = Object.fromEntries(
    DEMO_TRACKS.map(({ key }, i) => {
      const trackId = json.mapping[tracks[i].id]
      if (!trackId) throw new Error(`Demo track ${key} not found after seeding`)
      return [key, trackId]
    }),
  )

  const carts = ensureOk('Listing carts', await fetchViaBrowser(page, '/api/me/carts')).json || []
  const cart = await findOrCreateCart(page, carts, CART_NAME)
  const otherCart = await findOrCreateCart(page, carts, OTHER_CART_NAME)
  await setCartTracks(
    page,
    cart,
    DEMO_TRACKS.map(({ key }) => ids[key]),
  )
  await setCartTracks(page, otherCart, [ids.PB2])

  for (const { key, state } of DEMO_TRACKS) {
    ensureOk(
      `Setting the review state of ${key}`,
      await fetchViaBrowser(page, `/api/me/carts/${cart.id}/tracks/${ids[key]}/review`, {
        method: 'PUT',
        body: { state },
      }),
    )
  }
  ensureOk(
    'Switching review off',
    await fetchViaBrowser(page, `/api/me/carts/${cart.id}/review`, { method: 'PUT', body: { enabled: false } }),
  )
  return { cart, otherCart, ids }
}
