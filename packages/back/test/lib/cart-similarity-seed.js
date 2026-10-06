// Seeding for the cart similarity demo tests. Everything goes through the API with the browser session, so the same
// code seeds the local backend and the deployed preview (which has no DB access):
//   1. POST /api/me/tracks       synthetic Beatport tracks (upserted by store id, so re-runs are no-ops)
//   2. POST /api/admin/analyse   synthetic embeddings for their previews (upsert; needs an admin session)
//   3. POST /api/me/carts        the demo cart with the "A" and "B" style tracks (reused when it already exists)

const { beatportTracksTransform } = require('../../../browser-extension/src/js/transforms/beatport')
const { storeUrl: beatportUrl } = require('../../routes/stores/beatport/logic')
const template = beatportTracksTransform(require('../fixtures/noisia_concussion_beatport.json'))[0]

const MODEL = 'discogs_multi_embeddings-effnet-bs64-1'
const DIM = 1280
const TOKEN = 'fpcartsimdemo'
const CART_NAME = 'Cart similarity demo'

// Two styles in the cart (A, B), similar tracks for each, and one unrelated track (C).
const DEMO_TRACKS = [
  { key: 'A1', style: 0, inCart: true },
  { key: 'A2', style: 0, inCart: true },
  { key: 'A3', style: 0, inCart: true },
  { key: 'B1', style: 1, inCart: true },
  { key: 'B2', style: 1, inCart: true },
  { key: 'B3', style: 1, inCart: true },
  { key: 'Near A1', style: 0 },
  { key: 'Near A2', style: 0 },
  { key: 'Near A3', style: 0 },
  { key: 'Near B1', style: 1 },
  { key: 'Near B2', style: 1 },
  { key: 'Near B3', style: 1 },
  { key: 'Far C1', style: 2 },
]

const titleOf = (key) => `${TOKEN} ${key}`

const demoTrack = ({ key }, index) => {
  const id = String(990770100 + index)
  const slug = key.toLowerCase().replace(/\s+/g, '-')
  return {
    ...template,
    id,
    title: titleOf(key),
    url: `https://www.beatport.com/track/${TOKEN}-${slug}/${id}`,
    isrc: null,
    // Recent dates: tracks published more than two years ago are skipped when added as new tracks.
    released: '2026-09-01',
    published: '2026-09-01',
    // Its own release and catalogue number: ingestion merges tracks with the same catalogue and track number.
    release: {
      ...template.release,
      id: String(990770900 + index),
      catalog_number: `FPCSD${String(index).padStart(3, '0')}`,
      isrc: null,
      title: `${TOKEN} release ${key}`,
      url: `https://www.beatport.com/release/${TOKEN}-${slug}/${990770900 + index}`,
    },
    track_number: 1,
    artists: [
      {
        name: `Cart Demo Artist ${key}`,
        id: String(990770500 + index),
        url: `https://www.beatport.com/artist/cart-demo-${slug}/${990770500 + index}`,
        role: 'author',
      },
    ],
    previews: template.previews.map((p) => ({ ...p, url: `https://example.com/${TOKEN}/${slug}.mp3` })),
    waveform: undefined,
  }
}

// An embedding near one of three orthogonal "style" directions, with a small, deterministic per-track offset.
const styleVector = (style, index) =>
  Array.from({ length: DIM }, (_, i) => (i === style * 10 ? 1 : 0) + Math.sin((i + 1) * (index + 1) * 0.37) * 0.04)

const fetchViaBrowser = (page, path, { method = 'GET', body, headers } = {}) =>
  page.evaluate(
    async ({ path, method, body, headers }) => {
      const r = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(headers || {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      const text = await r.text()
      let json
      try {
        json = JSON.parse(text)
      } catch {
        json = undefined
      }
      return { status: r.status, text, json }
    },
    { path, method, body, headers },
  )

const ensureOk = (label, res) => {
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${label} failed: HTTP ${res.status} — ${String(res.text).slice(0, 300)}`)
  }
  return res
}

module.exports.CART_NAME = CART_NAME
module.exports.titleOf = titleOf
module.exports.DEMO_TRACKS = DEMO_TRACKS

module.exports.seedCartSimilarityViaApi = async (page) => {
  ensureOk(
    'Seeding the demo tracks',
    await fetchViaBrowser(page, '/api/me/tracks', {
      method: 'POST',
      body: DEMO_TRACKS.map(demoTrack),
      headers: { 'x-multi-store-player-store': beatportUrl },
    }),
  )

  const search = ensureOk(
    'Finding the demo tracks',
    await fetchViaBrowser(page, `/api/tracks?q=${encodeURIComponent(TOKEN)}&limit=100&sort=-released`),
  )
  const byTitle = new Map((search.json?.tracks || []).map((t) => [t.title, t]))
  const seeded = DEMO_TRACKS.map((d, index) => ({ ...d, index, track: byTitle.get(titleOf(d.key)) }))
  const missing = seeded.filter(({ track }) => !track).map(({ key }) => key)
  if (missing.length > 0) throw new Error(`Demo tracks not found after seeding: ${missing.join(', ')}`)

  ensureOk(
    'Uploading the demo embeddings',
    await fetchViaBrowser(page, '/api/admin/analyse', {
      method: 'POST',
      body: seeded.flatMap(({ track, style, index }) =>
        track.previews.map(({ id }) => ({ id, model: MODEL, embeddings: JSON.stringify(styleVector(style, index)) })),
      ),
    }),
  )

  const cartTrackIds = seeded.filter(({ inCart }) => inCart).map(({ track }) => track.id)
  const carts = ensureOk('Listing carts', await fetchViaBrowser(page, '/api/me/carts')).json || []
  let cart = carts.find(({ name }) => name === CART_NAME)
  if (!cart) {
    cart = ensureOk(
      'Creating the demo cart',
      await fetchViaBrowser(page, '/api/me/carts', {
        method: 'POST',
        body: { name: CART_NAME, tracks: cartTrackIds.map((trackId) => ({ trackId })) },
      }),
    ).json
  } else {
    ensureOk(
      'Filling the demo cart',
      await fetchViaBrowser(page, `/api/me/carts/${cart.id}/tracks`, {
        method: 'PATCH',
        body: cartTrackIds.map((trackId) => ({ op: 'add', trackId })),
      }),
    )
  }
  return { cart, seeded }
}
