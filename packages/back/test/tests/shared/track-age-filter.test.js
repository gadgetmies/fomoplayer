const assert = require('assert')
const { test } = require('cascade-test')
const { isTrackTooOld } = require('../../../routes/shared/tracks.js')

const DAY_MS = 1000 * 60 * 60 * 24
// Fixed reference point so the tests don't depend on the wall clock.
const NOW = new Date('2026-05-29T00:00:00.000Z').getTime()
const daysAgo = (days) => new Date(NOW - days * DAY_MS).toISOString()

test({
  'skips a track published older than maxAgeDays': () => {
    const track = { id: 'old', published: daysAgo(800) }
    assert.strictEqual(isTrackTooOld(track, { maxAgeDays: 730, now: NOW }), true)
  },

  'keeps a track published within maxAgeDays': () => {
    const track = { id: 'fresh', published: daysAgo(100) }
    assert.strictEqual(isTrackTooOld(track, { maxAgeDays: 730, now: NOW }), false)
  },

  'honors a configurable threshold': () => {
    const track = { id: 'middle', published: daysAgo(500) }
    // 500 days old: kept under a 730-day cutoff, skipped under a 365-day cutoff.
    assert.strictEqual(isTrackTooOld(track, { maxAgeDays: 730, now: NOW }), false)
    assert.strictEqual(isTrackTooOld(track, { maxAgeDays: 365, now: NOW }), true)
  },

  'never skips purchased tracks regardless of age': () => {
    const track = { id: 'bought', published: daysAgo(5000) }
    assert.strictEqual(isTrackTooOld(track, { type: 'purchased', maxAgeDays: 730, now: NOW }), false)
  },

  'never skips when skipOld is false': () => {
    const track = { id: 'kept', published: daysAgo(5000) }
    assert.strictEqual(isTrackTooOld(track, { skipOld: false, maxAgeDays: 730, now: NOW }), false)
  },
})
