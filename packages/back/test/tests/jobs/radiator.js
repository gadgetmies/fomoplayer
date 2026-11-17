const assert = require('assert')
const { test } = require('cascade-test')

const { runRadiatorQuery } = require('../../../jobs/radiator/run-query')

const rows = (count) => Array.from({ length: count }, (_, i) => ({ i }))

test({
  'stores the rows of a query within the limit': async () => {
    const result = await runRadiatorQuery('SELECT', { queryRows: async () => rows(3), maxRows: 3 })
    assert.deepStrictEqual(result, { result: rows(3), success: true })
  },
  'fails a query returning more rows than the limit without storing them': async () => {
    const result = await runRadiatorQuery('SELECT', { queryRows: async () => rows(4), maxRows: 3 })
    assert.strictEqual(result.success, false)
    assert.match(result.result.error, /returned 4 rows, more than the 3/)
  },
  'fails a query that throws': async () => {
    const result = await runRadiatorQuery('SELECT', {
      queryRows: async () => {
        throw new Error('boom')
      },
    })
    assert.strictEqual(result.success, false)
  },
})
