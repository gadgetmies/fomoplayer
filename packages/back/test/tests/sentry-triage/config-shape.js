'use strict'

// Shape guard for packages/back/config/sentry-triage.js. The triage pipeline
// trusts the config to have specific keys with specific types — silently
// dropping a field would mean the filter that depends on it stops firing,
// which we wouldn't notice until a runaway dispatch hit a real cap.

const assert = require('assert')
const { test } = require('cascade-test')
const config = require('../../../config/sentry-triage')

const ALLOWED_DENYLIST_TYPES = new Set(['http_status', 'message_regex', 'logger_name'])

test({
  'sentry-triage config': {
    'exposes denylist, thresholds, and rateLimit at the top level': () => {
      assert.ok(Array.isArray(config.denylist), 'denylist must be an array')
      assert.ok(typeof config.thresholds === 'object' && config.thresholds !== null, 'thresholds must be an object')
      assert.ok(typeof config.rateLimit === 'object' && config.rateLimit !== null, 'rateLimit must be an object')
    },

    'denylist entries each declare a known type and a non-empty match': () => {
      assert.ok(config.denylist.length > 0, 'denylist must not be empty')
      for (const rule of config.denylist) {
        assert.ok(
          ALLOWED_DENYLIST_TYPES.has(rule.type),
          `denylist rule type must be one of ${[...ALLOWED_DENYLIST_TYPES].join(', ')}, got ${rule.type}`,
        )
        const matchOk =
          typeof rule.match === 'string' ||
          typeof rule.match === 'number' ||
          (Array.isArray(rule.match) && rule.match.length > 0)
        assert.ok(matchOk, `denylist rule match must be string, number, or non-empty array (rule ${JSON.stringify(rule)})`)
        if (rule.name !== undefined) {
          assert.equal(typeof rule.name, 'string', 'denylist rule name must be a string when provided')
          assert.notEqual(rule.name.trim(), '', 'denylist rule name must not be blank')
        }
      }
    },

    'thresholds expose positive minEvents and minTimeWindowMs': () => {
      assert.equal(typeof config.thresholds.minEvents, 'number', 'thresholds.minEvents must be a number')
      assert.ok(config.thresholds.minEvents > 0, 'thresholds.minEvents must be > 0')
      assert.equal(typeof config.thresholds.minTimeWindowMs, 'number', 'thresholds.minTimeWindowMs must be a number')
      assert.ok(config.thresholds.minTimeWindowMs > 0, 'thresholds.minTimeWindowMs must be > 0')
    },

    'rateLimit exposes positive integer maxInFlight and maxDispatchesPerDay': () => {
      for (const key of ['maxInFlight', 'maxDispatchesPerDay']) {
        const value = config.rateLimit[key]
        assert.equal(typeof value, 'number', `rateLimit.${key} must be a number`)
        assert.ok(Number.isInteger(value), `rateLimit.${key} must be an integer`)
        assert.ok(value > 0, `rateLimit.${key} must be > 0`)
      }
    },
  },
})
