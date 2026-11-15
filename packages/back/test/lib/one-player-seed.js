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

// A track whose artists, label and title are far too long for the docked bar, to show they are cut short. Its own
// store ids and catalog number keep it apart from the one-player tracks.
const LONG_TEXT_TITLE = 'Long Text Demo: A Track Title That Keeps Going Well Past The Width Of Any Player Bar'
const longTextTrack = (() => {
  const id = '990000201'
  return {
    ...concussionWithoutIsrc,
    id,
    title: LONG_TEXT_TITLE,
    url: `https://www.beatport.com/track/long-text-demo/${id}`,
    artists: Array.from({ length: 8 }, (_, index) => ({
      name: `Long Text Demo Artist With A Rather Long Name ${index + 1}`,
      id: String(990000301 + index),
      url: `https://www.beatport.com/artist/long-text-demo-artist/${990000301 + index}`,
      role: 'author',
    })),
    label: {
      id: '990000401',
      name: 'Long Text Demo Label: An Exceptionally Long Record Label Name For A Collective Of Labels',
      url: 'https://www.beatport.com/label/long-text-demo-label/990000401',
    },
    release: {
      ...concussion.release,
      isrc: null,
      id,
      title: `${LONG_TEXT_TITLE} (release)`,
      catalog_number: 'FOMO-LONG-TEXT-DEMO',
      url: `https://www.beatport.com/release/long-text-demo/${id}`,
    },
  }
})()

// Same endpoint the browser extension uses; adding the same store tracks again is an upsert, so re-runs against the
// persistent preview are safe. skipOld=false because the fixture was published in 2005.
const seedBeatportTracksViaApi = async (page, tracks, what) => {
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
    { tracks, store: beatportUrl },
  )
  if (status < 200 || status >= 300) throw new Error(`Seeding ${what} failed: HTTP ${status} — ${text}`)
}

const seedOnePlayerTracksViaApi = (page) => seedBeatportTracksViaApi(page, onePlayerTracks, 'one-player tracks')
const seedLongTextTrackViaApi = (page) => seedBeatportTracksViaApi(page, [longTextTrack], 'the long text track')

module.exports = {
  seedOnePlayerTracksViaApi,
  seedLongTextTrackViaApi,
  onePlayerTracks,
  ONE_PLAYER_TITLES,
  LONG_TEXT_TITLE,
}
