// Local demo (demo-test workflow) of the admin tab bar. Also the PR's demo-test-before target: that recording runs
// casesBeforeChange (the old hub-and-spoke navigation) against the code without the tab bar (see demo-test.js).
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { demoTest } = require('../lib/demo-test')
const { gotoAdmin, cases, casesBeforeChange } = require('../lib/admin-tab-bar-steps')

demoTest({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await gotoAdmin(page)
    return { page, timeout: 60000 }
  },
  cases,
  casesBeforeChange,
})
