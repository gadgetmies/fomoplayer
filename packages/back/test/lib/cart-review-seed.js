// Seeding for the cart review demo tests. Everything goes through the API with the browser session, so the same code
// seeds the local backend and the deployed preview (which has no DB access), and running it again puts the demo cart
// back to the same state (the preview keeps its data between runs):
//   1. POST /api/me/tracks            four Beatport and three Bandcamp tracks (upserted by store id)
//   2. POST/PUT/PATCH /api/me/carts   the demo cart holding exactly those tracks, newest first in a fixed order
//   3. PUT .../review                 every track to review and the cart's review switched off

const { beatportTracksTransform } = require('../../../browser-extension/src/js/transforms/beatport')
const { storeUrl: beatportUrl } = require('../../routes/stores/beatport/logic')
const { storeUrl: bandcampUrl } = require('../../routes/stores/bandcamp/logic')
const { fetchViaBrowser, ensureOk } = require('./cart-similarity-seed')

const [concussion] = beatportTracksTransform(require('../fixtures/noisia_concussion_beatport.json'))
const { isrc, store_details, ...concussionWithoutIsrc } = concussion

const TOKEN = 'fpcartreviewdemo'
const CART_NAME = 'Cart review demo'

// The cart's rows, newest first.
const DEMO_TRACKS = [
  { key: 'BP1', store: 'Beatport' },
  { key: 'BP2', store: 'Beatport' },
  { key: 'BP3', store: 'Beatport' },
  { key: 'BC1', store: 'Bandcamp' },
  { key: 'BP4', store: 'Beatport' },
  { key: 'BC2', store: 'Bandcamp' },
  { key: 'BC3', store: 'Bandcamp' },
]

const titleOf = (key) => `${TOKEN} ${key}`

// A Beatport track playing the Concussion fixture's sample, with its own ids so ingestion does not merge it.
const beatportTrack = (key, index) => {
  const id = String(990880100 + index)
  return {
    ...concussionWithoutIsrc,
    id,
    title: titleOf(key),
    url: `https://www.beatport.com/track/${TOKEN}-${key.toLowerCase()}/${id}`,
    released: '2026-09-01',
    published: '2026-09-01',
    release: {
      ...concussion.release,
      isrc: null,
      id,
      title: `${TOKEN} release ${key}`,
      catalog_number: `FPCRD-${key}`,
      url: `https://www.beatport.com/release/${TOKEN}-${key.toLowerCase()}/${id}`,
    },
    artists: [
      {
        name: `Review Demo Artist ${key}`,
        id: String(990880500 + index),
        url: `https://www.beatport.com/artist/review-demo-${key.toLowerCase()}/${990880500 + index}`,
        role: 'author',
      },
    ],
  }
}

const bandcampTrack = (key, index) => ({
  id: String(990880200 + index),
  url: `https://cart-review-demo.bandcamp.com/track/${key.toLowerCase()}`,
  title: titleOf(key),
  version: null,
  duration_ms: 180000,
  released: '2026-09-01T12:00:00Z',
  published: '2026-09-01T12:00:00Z',
  track_number: 1,
  isrc: null,
  artists: [
    {
      name: `Review Demo Artist ${key}`,
      role: 'author',
      id: `cart-review-demo-artist-${key.toLowerCase()}`,
      url: `https://cart-review-demo-${key.toLowerCase()}.bandcamp.com`,
    },
  ],
  release: {
    id: `cart-review-demo-release-${key.toLowerCase()}`,
    url: `https://cart-review-demo.bandcamp.com/album/${key.toLowerCase()}`,
    title: `${TOKEN} release ${key}`,
    release_date: '2026-09-01T12:00:00Z',
    catalog_number: null,
    isrc: null,
  },
  previews: [
    {
      format: 'mp3',
      url: `https://cart-review-demo.bandcamp.com/stream/${key.toLowerCase()}.mp3`,
      start_ms: 0,
      end_ms: 180000,
    },
  ],
})

// Adds the store's demo tracks and resolves to their track ids by key.
const addTracks = async (page, storeUrl, entries, build) => {
  const tracks = entries.map(({ key, index }) => build(key, index))
  const { json } = ensureOk(
    `Seeding the ${storeUrl} demo tracks`,
    await fetchViaBrowser(page, '/api/me/tracks?skipOld=false&return=mapping', {
      method: 'POST',
      body: tracks,
      headers: { 'x-multi-store-player-store': storeUrl },
    }),
  )
  return Object.fromEntries(
    entries.map(({ key }, i) => {
      const trackId = json.mapping[tracks[i].id]
      if (!trackId) throw new Error(`Demo track ${key} not found after seeding`)
      return [key, trackId]
    }),
  )
}

module.exports.CART_NAME = CART_NAME
module.exports.DEMO_TRACKS = DEMO_TRACKS
module.exports.titleOf = titleOf

module.exports.seedCartReviewViaApi = async (page) => {
  const indexed = DEMO_TRACKS.map((track, index) => ({ ...track, index }))
  const ids = {
    ...(await addTracks(page, beatportUrl, indexed.filter(({ store }) => store === 'Beatport'), beatportTrack)),
    ...(await addTracks(page, bandcampUrl, indexed.filter(({ store }) => store === 'Bandcamp'), bandcampTrack)),
  }

  const carts = ensureOk('Listing carts', await fetchViaBrowser(page, '/api/me/carts')).json || []
  let cart = carts.find(({ name }) => name === CART_NAME)
  if (!cart) {
    cart = ensureOk(
      'Creating the demo cart',
      await fetchViaBrowser(page, '/api/me/carts', { method: 'POST', body: { name: CART_NAME } }),
    ).json
  }
  const trackIds = DEMO_TRACKS.map(({ key }) => ids[key])
  ensureOk(
    'Setting the demo cart tracks',
    await fetchViaBrowser(page, `/api/me/carts/${cart.id}/tracks`, { method: 'PUT', body: trackIds }),
  )
  const now = Date.now()
  ensureOk(
    'Ordering the demo cart tracks',
    await fetchViaBrowser(page, `/api/me/carts/${cart.id}/tracks`, {
      method: 'PATCH',
      body: trackIds.map((trackId, i) => ({ op: 'add', trackId, addedAt: new Date(now - (i + 1) * 60000).toISOString() })),
    }),
  )
  for (const trackId of trackIds) {
    ensureOk(
      'Resetting a demo track to review',
      await fetchViaBrowser(page, `/api/me/carts/${cart.id}/tracks/${trackId}/review`, {
        method: 'PUT',
        body: { state: null },
      }),
    )
  }
  ensureOk(
    'Switching review off',
    await fetchViaBrowser(page, `/api/me/carts/${cart.id}/review`, { method: 'PUT', body: { enabled: false } }),
  )
  return { cart, ids }
}
