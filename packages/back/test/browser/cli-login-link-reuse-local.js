// Local demo (demo-test workflow): recorded against a backend spun up inside
// the CI runner. The flow needs no seeded state beyond the logged-in session,
// so it is identical to the preview test; only this comment and the filename
// differ.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const {
  startCallbackListener,
  buildCliLoginLink,
  assertLinkCannotBeReused,
} = require('../lib/cli-login-link-reuse-steps')

let callbackListener = null

test({
  teardown: async () => {
    if (callbackListener) await callbackListener.close()
    await teardownSharedContext()
  },
  setup: async () => {
    const { page } = await getSharedContext()
    callbackListener = await startCallbackListener()
    const link = buildCliLoginLink(page, callbackListener.port)
    return { page, link, timeout: 30000 }
  },

  'an approved CLI login link shows "already used" when reopened': assertLinkCannotBeReused,
})
