// Preview demo (demo-preview workflow): runs against the deployed Railway PR preview with no direct DB access.
// The Notifications page: the top-bar link, Activity, adding and removing a search subscription, the notify bell on a
// followed artist, and Settings › Email. Tracks and the follow are seeded through the API. Notification events can
// only come from the notification jobs, so the unread badge and A/B playback are recorded by the local demo.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedOnePlayerTracksViaApi } = require('../lib/one-player-seed')
const { seedFollowViaApi } = require('../lib/follow-popup-seed')
const {
  openNotificationsFromTopBar,
  assertActivityTabOpens,
  assertSubscriptionsAddAndRemove,
  assertFollowingBellSubscribesArtist,
  assertSettingsEmailTab,
} = require('../lib/notifications-page-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await seedOnePlayerTracksViaApi(page)
    await seedFollowViaApi(page)
    await openNotificationsFromTopBar(page)
    return { page, timeout: 45000 }
  },

  'the top bar opens Notifications › Activity': assertActivityTabOpens,
  'a search subscription can be added and removed': assertSubscriptionsAddAndRemove,
  'the bell on a followed artist subscribes to it': assertFollowingBellSubscribesArtist,
  'Settings › Notifications is now Settings › Email': assertSettingsEmailTab,
})
