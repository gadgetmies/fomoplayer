// Preview demo (demo-preview workflow), run against the Railway PR preview. Tracks are seeded
// (via the API there) so the tutorial doesn't auto-start for an empty collection; this matches
// guided-tours-local.js line for line.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')
const { walkOnboarding, walkSettingsHelp } = require('../lib/guided-tours-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await seedTracks({ userIds: [await resolveTestUserId()] })
    return { page, timeout: 60000 }
  },
  'the onboarding tutorial opens, advances and closes': walkOnboarding,
  'the Settings help tour steps forward and back': walkSettingsHelp,
})
