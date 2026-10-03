// Local demo (demo-test workflow). The feature needs no seeded state, so this is identical to
// error-boundary-preview.js apart from the environment it runs against.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { crashAndAssertFallback, assertAppRecoversWithoutCrashParam } = require('../lib/error-boundary-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    return { page, timeout: 30000 }
  },
  'a render error shows the fallback and is reported to the backend': crashAndAssertFallback,
  'the app renders normally without the crash parameter': assertAppRecoversWithoutCrashParam,
})
