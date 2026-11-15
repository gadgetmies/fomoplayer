// Preview demo (demo-preview workflow) of the admin tab bar. Needs the session user to be an admin on the preview
// (the preview Actions bot is granted admin from its OIDC sub). The before recording is local only, so this file
// has no casesBeforeChange.
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { demoTest } = require('../lib/demo-test')
const { gotoAdmin, cases } = require('../lib/admin-tab-bar-steps')

demoTest({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await gotoAdmin(page)
    return { page, timeout: 60000 }
  },
  cases,
})
