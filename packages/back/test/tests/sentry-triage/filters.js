'use strict'

const assert = require('assert')
const { test } = require('cascade-test')
const {
  denylistMatch,
  belowThreshold,
  composePipeline,
} = require('../../../services/sentry-triage/filters')

const issueWith = (extras = {}) => ({
  issue: { id: 'ABC', count: 100, firstSeen: '2026-05-01T00:00:00Z', lastSeen: '2026-05-19T00:00:00Z', ...extras },
})

test({
  'denylistMatch (table-driven)': {
    'http_status: matches single int': () => {
      const config = { denylist: [{ name: 'http_404', type: 'http_status', match: 404 }] }
      const result = denylistMatch({ http_status: 404 }, config)
      assert.deepEqual(result, { reason: 'denylist:http_404' })
    },
    'http_status: matches array of ints': () => {
      const config = { denylist: [{ type: 'http_status', match: [400, 401, 403, 404] }] }
      assert.deepEqual(denylistMatch({ http_status: 401 }, config), { reason: 'denylist:http_status:400,401,403,404' })
      assert.equal(denylistMatch({ http_status: 500 }, config), null)
    },
    'http_status: reads from event.contexts.response.status_code': () => {
      const config = { denylist: [{ name: 'http_4xx', type: 'http_status', match: [400, 401, 403, 404] }] }
      const evt = { event: { contexts: { response: { status_code: 403 } } } }
      assert.deepEqual(denylistMatch(evt, config), { reason: 'denylist:http_4xx' })
    },
    'http_status: reads from event.tags array': () => {
      const config = { denylist: [{ type: 'http_status', match: 404 }] }
      const evt = { event: { tags: [['runtime', 'back'], ['http_status', '404']] } }
      assert.deepEqual(denylistMatch(evt, config), { reason: 'denylist:http_status:404' })
    },
    'message_regex: matches against event.message': () => {
      const config = { denylist: [{ name: 'econnreset', type: 'message_regex', match: 'ECONNRESET' }] }
      assert.deepEqual(denylistMatch({ message: 'socket ECONNRESET' }, config), { reason: 'denylist:econnreset' })
      assert.equal(denylistMatch({ message: 'something else' }, config), null)
    },
    'message_regex: matches against exception value': () => {
      const config = { denylist: [{ name: 'foo', type: 'message_regex', match: '^Cannot read' }] }
      const evt = { event: { exception: { values: [{ value: 'Cannot read properties of undefined' }] } } }
      assert.deepEqual(denylistMatch(evt, config), { reason: 'denylist:foo' })
    },
    'message_regex: array of patterns matches when any pattern hits': () => {
      const config = { denylist: [{ name: 'noise', type: 'message_regex', match: ['ECONNRESET', 'ETIMEDOUT'] }] }
      assert.deepEqual(denylistMatch({ message: 'connect ETIMEDOUT' }, config), { reason: 'denylist:noise' })
    },
    'logger_name: matches single name': () => {
      const config = { denylist: [{ name: 'morgan', type: 'logger_name', match: 'morgan' }] }
      assert.deepEqual(denylistMatch({ logger: 'morgan' }, config), { reason: 'denylist:morgan' })
      assert.equal(denylistMatch({ logger: 'winston' }, config), null)
    },
    'logger_name: matches array': () => {
      const config = { denylist: [{ type: 'logger_name', match: ['morgan', 'access-log'] }] }
      assert.deepEqual(denylistMatch({ logger: 'access-log' }, config), { reason: 'denylist:logger_name:morgan,access-log' })
    },
    'first matching rule wins (short-circuit)': () => {
      const config = {
        denylist: [
          { name: 'first', type: 'http_status', match: 404 },
          { name: 'second', type: 'http_status', match: 404 },
        ],
      }
      assert.deepEqual(denylistMatch({ http_status: 404 }, config), { reason: 'denylist:first' })
    },
    'empty / missing denylist returns null': () => {
      assert.equal(denylistMatch({ http_status: 404 }, { denylist: [] }), null)
      assert.equal(denylistMatch({ http_status: 404 }, {}), null)
    },
    'unknown rule type does not match': () => {
      const config = { denylist: [{ type: 'unknown', match: 'whatever' }] }
      assert.equal(denylistMatch({ http_status: 404, message: 'whatever' }, config), null)
    },
  },

  'belowThreshold': {
    'event_count below minEvents → skip': () => {
      const evt = issueWith({ count: 2 })
      const config = { thresholds: { minEvents: 5 } }
      assert.deepEqual(belowThreshold(evt, config), { reason: 'below_threshold' })
    },
    'event_count at minEvents → pass (boundary)': () => {
      const evt = issueWith({ count: 5 })
      const config = { thresholds: { minEvents: 5 } }
      assert.equal(belowThreshold(evt, config), null)
    },
    'event_count above minEvents → pass': () => {
      const evt = issueWith({ count: 10 })
      const config = { thresholds: { minEvents: 5 } }
      assert.equal(belowThreshold(evt, config), null)
    },
    'firstSeen inside time window → skip even when count is high': () => {
      // first seen 10 minutes ago; window is 30 minutes ⇒ inside window ⇒ skip
      const now = Date.parse('2026-05-19T12:00:00Z')
      const evt = issueWith({
        count: 50,
        firstSeen: '2026-05-19T11:50:00Z',
        lastSeen: '2026-05-19T11:59:30Z',
      })
      const config = { thresholds: { minEvents: 5, minTimeWindowMs: 30 * 60 * 1000 } }
      assert.deepEqual(belowThreshold(evt, config, now), { reason: 'below_threshold' })
    },
    'firstSeen older than time window → pass': () => {
      const now = Date.parse('2026-05-19T12:00:00Z')
      const evt = issueWith({
        count: 50,
        firstSeen: '2026-05-19T10:00:00Z',
        lastSeen: '2026-05-19T11:59:30Z',
      })
      const config = { thresholds: { minEvents: 5, minTimeWindowMs: 30 * 60 * 1000 } }
      assert.equal(belowThreshold(evt, config, now), null)
    },
    'missing thresholds config → pass': () => {
      const evt = issueWith({ count: 1 })
      assert.equal(belowThreshold(evt, {}), null)
    },
  },

  'composePipeline': {
    'returns pass when all filters return null': () => {
      const pipeline = composePipeline([() => null, () => null])
      assert.deepEqual(pipeline({}, {}), { skip: false })
    },
    'short-circuits on first skip': () => {
      let secondCalled = false
      const pipeline = composePipeline([
        () => ({ reason: 'first_skip' }),
        () => {
          secondCalled = true
          return null
        },
      ])
      const result = pipeline({}, {})
      assert.equal(result.skip, true)
      assert.equal(result.reason, 'first_skip')
      assert.equal(secondCalled, false, 'second filter must NOT be called after a skip')
    },
    'records the skipping filter name when available': () => {
      function namedFilter() {
        return { reason: 'denylist:foo' }
      }
      const pipeline = composePipeline([namedFilter])
      const result = pipeline({}, {})
      assert.equal(result.filter, 'namedFilter')
    },
    'rejects non-array argument': () => {
      assert.throws(() => composePipeline(null), TypeError)
      assert.throws(() => composePipeline('not an array'), TypeError)
    },
  },
})
