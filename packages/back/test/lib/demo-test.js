// Demo tests with an optional recording of the UI as it was before the change.
//
//   demoTest({ setup, teardown, cases, casesBeforeChange })
//
// `cases` are the demo's ordinary test cases ({ 'case name': async ({ page }) => { ... } }): the flow on the
// changed UI. `casesBeforeChange` is an optional second set of cases walking the same flow on the UI as it was
// before the change. They are not setup hooks; they replace `cases` in exactly one run: the before recording that a
// PR asks for with a demo-test-before block, which runs this file with DEMO_PHASE=before against the app code of
// the commit the PR merges onto. Every other run (normal CI, local runs, the demo-test and demo-preview
// recordings) runs `cases`. Both sets share `setup` and `teardown`.
const { test } = require('cascade-test')

const isBeforeChange = process.env.DEMO_PHASE === 'before'

const demoTest = ({ cases, casesBeforeChange, ...suite }) => {
  const selected = isBeforeChange ? casesBeforeChange : cases
  if (!selected || Object.keys(selected).length === 0) {
    throw new Error(
      isBeforeChange
        ? 'DEMO_PHASE=before, but this demo test defines no `casesBeforeChange`. Add them, or remove the demo-test-before block from the PR body.'
        : 'demoTest needs at least one case in `cases`',
    )
  }
  return test({ ...suite, ...selected })
}

module.exports = { demoTest, isBeforeChange }
