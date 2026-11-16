// Local demo (demo-test workflow) of enabling and disabling jobs on the admin Jobs page.
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { demoTest } = require('../lib/demo-test')
const { gotoJobs, cases } = require('../lib/admin-job-toggle-steps')

demoTest({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await gotoJobs(page)
    return { page, timeout: 60000 }
  },
  cases,
})
