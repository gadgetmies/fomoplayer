const assert = require('assert')
const { test } = require('cascade-test')
const { initDb, pg } = require('../../lib/db')
const { logRequestError } = require('../../../routes/shared/error-logging')

const createLoggerSpy = () => {
  const calls = []
  return {
    logger: {
      error: (...args) => calls.push(args),
    },
    calls,
  }
}

test({
  setup: async () => {
    await initDb()
  },

  'when a postgres query fails': async () => {
    const { logger, calls } = createLoggerSpy()

    let queryError
    try {
      await pg.queryAsync('SELECT * FROM this_table_does_not_exist_for_error_logging_test')
    } catch (e) {
      queryError = e
    }

    assert.ok(queryError, 'expected query to fail against test database')

    logRequestError(logger, queryError, {
      method: 'POST',
      url: '/api/test',
    })

    assert.equal(calls.length, 1)

    const [message, context] = calls[0]
    assert.equal(message, 'Database query failed')
    assert.equal(context.method, 'POST')
    assert.equal(context.url, '/api/test')
    assert.ok(context.dbError)
    assert.equal(context.dbError.code, '42P01')
    assert.equal(context.dbError.constraint, undefined)
    assert.equal(context.dbError.schema, undefined)
    assert.equal(context.body, undefined)
    assert.equal(context.dbError.message, undefined)
  },
})
