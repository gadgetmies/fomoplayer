// Preview demo (demo-preview workflow): runs against the deployed Railway PR preview with no direct DB access.
// The docked player on Settings on wider screens: a track started from Discover · Recent keeps playing on Settings;
// next to the bar's waveform sit a small stacked Preview / Listen switch, then cart, find similar, follow and ignore as
// icons and an expand button that opens a popup above them with share and the store links, stacked. The tracks are
// seeded through POST /api/me/tracks, the same way in both demos (docked-player-controls-mobile-*.js: on a phone).
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedOnePlayerTracksViaApi } = require('../lib/one-player-seed')
const { playFromRecent, assertDockedPlayerKeepsPlaying } = require('../lib/one-player-steps')
const {
  assertRowHasMainActions,
  assertCartButtonToggles,
  assertSourceToggleSwitches,
  openMore,
  assertSharePopupOpens,
  assertExpandButtonAndEscapeCloseMore,
} = require('../lib/docked-player-controls-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await seedOnePlayerTracksViaApi(page)
    const { order } = await playFromRecent(page)
    await assertDockedPlayerKeepsPlaying({ page, order })
    return { page, order, timeout: 45000 }
  },

  'the bar shows cart, find similar, follow, ignore and Preview / Listen': assertRowHasMainActions,
  'the cart button adds to and removes from the default cart': assertCartButtonToggles,
  'Preview / Listen switch the audio source': assertSourceToggleSwitches,
  'the expand button opens a popup at the right edge with share and store links stacked': openMore,
  'share opens its popup': assertSharePopupOpens,
  'the chevron and Escape close the popup': assertExpandButtonAndEscapeCloseMore,
})
