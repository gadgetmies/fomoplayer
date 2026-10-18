const { beatportTracksTransform } = require('../../../browser-extension/src/js/transforms/beatport')
const { storeUrl: beatportUrl } = require('../../routes/stores/beatport/logic')
const concussionFixture = require('../fixtures/noisia_concussion_beatport.json')

// Three Beatport tracks for the one-player demo, all playing the Concussion fixture's sample. The store ids, catalog
// numbers, release titles and titles are unique and the track and release ISRCs are dropped so the backend does not merge them into
// each other or into the seeded Concussion track.
const [concussion] = beatportTracksTransform(concussionFixture)
const { isrc, store_details, ...concussionWithoutIsrc } = concussion

const ONE_PLAYER_TITLES = ['One Player Demo A', 'One Player Demo B', 'One Player Demo C']

const onePlayerTracks = ONE_PLAYER_TITLES.map((title, index) => {
  const id = String(990000101 + index)
  return {
    ...concussionWithoutIsrc,
    id,
    title,
    url: `https://www.beatport.com/track/one-player-demo/${id}`,
    release: {
      ...concussion.release,
      isrc: null,
      id,
      title: `${title} (release)`,
      catalog_number: `FOMO-ONE-PLAYER-DEMO-${index}`,
      url: `https://www.beatport.com/release/one-player-demo/${id}`,
    },
  }
})

// Same endpoint the browser extension uses; adding the same store tracks again is an upsert, so re-runs against the
// persistent preview are safe. skipOld=false because the fixture was published in 2005.
const seedOnePlayerTracksViaApi = async (page) => {
  const { status, text } = await page.evaluate(
    async ({ tracks, store }) => {
      const r = await fetch('/api/me/tracks?skipOld=false', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'x-multi-store-player-store': store },
        body: JSON.stringify(tracks),
      })
      return { status: r.status, text: await r.text() }
    },
    { tracks: onePlayerTracks, store: beatportUrl },
  )
  if (status < 200 || status >= 300) throw new Error(`Seeding one-player tracks failed: HTTP ${status} — ${text}`)
}

module.exports = { seedOnePlayerTracksViaApi, onePlayerTracks, ONE_PLAYER_TITLES }
