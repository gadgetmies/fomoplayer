// Seeding for the follow-popup demo tests.
//
// The demo starts with the Noisia track from the shared seed already followed,
// so the popup shows an "Unfollow" button that must flip to "Follow" when
// clicked. On the preview the follow goes through the real
// POST /api/me/follows/artists endpoint (the same one the popup uses). Locally
// that endpoint would call the authenticated Beatport API, which the CI runner
// cannot reach, so seedFollowViaDb inserts the same watch rows directly and
// additionally gives the artist a Spotify store row: the popup must hide it,
// because the follow list it compares against only covers the active stores.

const sql = require('sql-template-strings')
const { beatportTracksTransform } = require('../../../browser-extension/src/js/transforms/beatport')
const { fetchViaBrowser } = require('./follow-suggestions-seed')

const [followedTrack] = beatportTracksTransform(require('../fixtures/noisia_concussion_beatport.json'))
const followedArtist = followedTrack.artists.find(({ role }) => role === 'author')

module.exports.followedTrackTitle = followedTrack.title
module.exports.followedArtistName = followedArtist.name

// Idempotent: the follow insert does ON CONFLICT DO NOTHING.
module.exports.seedFollowViaApi = async (page) => {
  const res = await fetchViaBrowser(page, '/api/me/follows/artists', {
    method: 'POST',
    body: [{ name: followedArtist.name, url: followedArtist.url }],
  })
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Seeding artist follow failed: HTTP ${res.status} — ${res.text}`)
  }
}

module.exports.seedFollowViaDb = async (userId) => {
  const { pg } = require('./db')
  await pg.queryAsync(sql`
    INSERT INTO store__artist (store__artist_store_id, store__artist_url, store_id, artist_id)
    SELECT 'followPopupDemoNoisia', 'https://open.spotify.com/artist/followPopupDemoNoisia', spotify.store_id, beatport.artist_id
    FROM store spotify, store__artist beatport
    WHERE spotify.store_name = 'Spotify' AND beatport.store__artist_url = ${followedArtist.url}
    ON CONFLICT DO NOTHING
  `)
  await pg.queryAsync(sql`
    INSERT INTO store__artist_watch (store__artist_id)
    SELECT store__artist_id FROM store__artist WHERE store__artist_url = ${followedArtist.url}
    ON CONFLICT DO NOTHING
  `)
  await pg.queryAsync(sql`
    INSERT INTO store__artist_watch__user (store__artist_watch_id, meta_account_user_id)
    SELECT store__artist_watch_id, ${userId}
    FROM store__artist_watch NATURAL JOIN store__artist
    WHERE store__artist_url = ${followedArtist.url}
    ON CONFLICT DO NOTHING
  `)
}
