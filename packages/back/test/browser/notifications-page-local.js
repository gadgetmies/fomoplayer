// Local demo (demo-test workflow): runs against a backend in the same runner.
// The same steps as notifications-page-preview.js, plus the ones that need notification events: those are written by
// the notification jobs only, so they (and the follow, whose API calls Beatport) are seeded through the DB here.
// Shows the unread badge, playing an Activity row reading it, and a sample match playing as an aligned A/B pair. The
// email is verified through the DB after the locked state is shown, since the real flow needs the emailed link.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { resolveTestUserId } = require('../lib/test-user')
const { seedOnePlayerTracksViaApi } = require('../lib/one-player-seed')
const { seedFollowViaDb } = require('../lib/follow-popup-seed')
const { seedNotificationEventsViaDb, setEmailVerifiedViaDb } = require('../lib/notifications-page-seed')
const {
  openNotificationsFromTopBar,
  assertActivityTabOpens,
  assertSubscribingNeedsVerifiedEmail,
  assertFailedUploadKeepsPlaying,
  assertSubscriptionsAddAndRemove,
  assertFollowingBellSubscribesArtist,
  assertSettingsEmailTab,
  assertUnreadBadge,
  assertPlayingActivityRowReadsIt,
  assertSampleMatchPlaysAligned,
} = require('../lib/notifications-page-steps')

test({
  teardown: async () => {
    await setEmailVerifiedViaDb(await resolveTestUserId(), false)
    await teardownSharedContext()
  },
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedOnePlayerTracksViaApi(page)
    await seedFollowViaDb(userId)
    const { unreadCount } = await seedNotificationEventsViaDb(userId)
    await setEmailVerifiedViaDb(userId, false)
    await openNotificationsFromTopBar(page)
    return { page, userId, unreadCount, timeout: 45000 }
  },

  'the top bar opens Notifications › Activity': assertActivityTabOpens,
  'subscribing needs a verified email': assertSubscribingNeedsVerifiedEmail,
  'with a verified email the subscription controls unlock': async ({ page, userId }) => {
    await setEmailVerifiedViaDb(userId, true)
    await page.goto('/notifications/subscriptions')
    await page.waitForSelector('.notifications-add-search', { state: 'visible', timeout: 10000 })
    await page.waitForFunction(() => !document.querySelector('.notifications-add-search input')?.disabled, null, {
      timeout: 10000,
    })
  },
  'a search subscription can be added and removed': assertSubscriptionsAddAndRemove,
  'the bell on a followed artist subscribes to it': assertFollowingBellSubscribesArtist,
  'Settings › Notifications is now Settings › Email': assertSettingsEmailTab,
  'the bell shows the unread count': (ctx) => assertUnreadBadge(ctx.unreadCount)(ctx),
  'playing an Activity row reads it': assertPlayingActivityRowReadsIt,
  'a sample match plays as an aligned A/B pair': assertSampleMatchPlaysAligned,
  'a failed sample upload keeps the track playing': assertFailedUploadKeepsPlaying,
})
