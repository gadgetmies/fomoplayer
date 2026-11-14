// Preview demo (demo-preview workflow): runs against the deployed Railway PR preview with no direct DB access.
// The docked player on Settings on a phone (the touch-enabled Pixel 5 context): the bar is the waveform above play,
// previous, next and the track; expanding it shows the full player of the track lists, whose Preview / Listen and cart
// work there, and the bar on top or a tap outside goes back. The tracks are seeded through POST /api/me/tracks with
// the desktop session, the same way in both demos (docked-player-controls-*.js: wider screens).
const { test } = require('cascade-test')
const { getSharedContext, getMobileContext, teardownSharedContext } = require('../lib/setup')
const { seedOnePlayerTracksViaApi } = require('../lib/one-player-seed')
const steps = require('../lib/docked-player-controls-mobile-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page: desktopPage } = await getSharedContext()
    await seedOnePlayerTracksViaApi(desktopPage)
    const { page } = await getMobileContext()
    await steps.playAndOpenSettingsOnPhone(page)
    return { page, timeout: 45000 }
  },

  'the bar is the waveform above play, previous, next and the track': steps.assertBarWaveformAboveControls,
  'tapping the waveform seeks': steps.assertBarWaveformSeeks,
  'expanding shows the full player of the track lists': steps.assertExpandShowsFullPlayer,
  'Preview / Listen switch the audio source': steps.assertSourceSelectSwitches,
  'the cart button adds to and removes from the default cart': steps.assertCartButtonToggles,
  'the bar on top goes back to the player bar': steps.assertCollapseReturnsToBar,
  'a tap outside goes back to the player bar': steps.assertTapOutsideReturnsToBar,
})
