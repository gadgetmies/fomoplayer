const {
  seedOnePlayerTracksViaApi,
  seedLongTextTrackViaApi,
  LONG_TEXT_TITLE,
  ONE_PLAYER_TITLES,
} = require('./one-player-seed')

// Seeding for the play-queue-source demo, through the API only, so the local and preview demos share it: the three
// one-player tracks for Discover · Recent, and the long text track in the default cart, so the cart on screen holds a
// track the Recent queue does not step to.

const fetchJsonViaBrowser = (page, path, { method = 'GET', body } = {}) =>
  page.evaluate(
    async ({ path, method, body }) => {
      const r = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const text = await r.text()
      let json = null
      try {
        json = JSON.parse(text)
      } catch {}
      return { status: r.status, text, json }
    },
    { path, method, body },
  )

const ensureOk = (what, res) => {
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${what} failed: HTTP ${res.status} — ${String(res.text).slice(0, 300)}`)
  }
  return res
}

const seedPlayQueueSourceViaApi = async (page) => {
  await seedOnePlayerTracksViaApi(page)
  await seedLongTextTrackViaApi(page)

  const search = ensureOk(
    'Finding the long text track',
    await fetchJsonViaBrowser(page, `/api/tracks?q=${encodeURIComponent('Long Text Demo')}&limit=20`),
  )
  const longTextTrack = (search.json?.tracks || []).find(({ title }) => title === LONG_TEXT_TITLE)
  if (!longTextTrack) throw new Error('The long text track was not found after seeding')

  const carts = ensureOk('Listing carts', await fetchJsonViaBrowser(page, '/api/me/carts')).json || []
  const defaultCart = carts.find(({ is_default, isDefault }) => is_default || isDefault)
  if (!defaultCart) throw new Error('The test user has no default cart')
  ensureOk(
    'Adding the long text track to the default cart',
    await fetchJsonViaBrowser(page, `/api/me/carts/${defaultCart.id}/tracks`, {
      method: 'PATCH',
      body: [{ op: 'add', trackId: longTextTrack.id }],
    }),
  )
}

// Marks the one-player tracks heard, one after another, so the Heard list holds all three in a known order
const markOnePlayerTracksHeardViaApi = async (page) => {
  const search = ensureOk(
    'Finding the one-player tracks',
    await fetchJsonViaBrowser(page, `/api/tracks?q=${encodeURIComponent('One Player Demo')}&limit=20`),
  )
  for (const title of ONE_PLAYER_TITLES) {
    const track = (search.json?.tracks || []).find((track) => track.title === title)
    if (!track) throw new Error(`${title} was not found after seeding`)
    ensureOk(
      `Marking ${title} heard`,
      await fetchJsonViaBrowser(page, `/api/me/tracks/${track.id}`, { method: 'POST', body: { heard: true } }),
    )
  }
}

module.exports = { seedPlayQueueSourceViaApi, markOnePlayerTracksHeardViaApi, LONG_TEXT_TITLE }
