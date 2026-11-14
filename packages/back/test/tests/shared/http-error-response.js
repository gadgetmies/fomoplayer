const assert = require('assert')
const { test } = require('cascade-test')
const { errorResponse, NotFound } = require('../../../routes/shared/httpErrors')

test({
  'an HttpError keeps its status and message': () => {
    assert.deepStrictEqual(errorResponse(new NotFound('No such track')), { code: 404, message: 'No such track' })
  },

  'a store rate limit or block page is a 503': () => {
    const error = new Error('Rate limit reached. Requests are suspended until: …')
    error.isRateLimit = true
    const { code, message } = errorResponse(error)
    assert.strictEqual(code, 503)
    assert.match(message, /temporarily unavailable/)
  },

  'any other error is a 500 without details': () => {
    assert.deepStrictEqual(errorResponse(new Error('secret detail')), { code: 500, message: 'Internal server error' })
  },
})
