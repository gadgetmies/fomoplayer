'use strict'
// In-process sliding window — state is not shared across multiple Node.js
// processes or instances. In a horizontally-scaled deployment, effective
// limits are perMinute×N and perDay×N where N is the instance count.
// Migrate to a shared store (Redis or Postgres) before scaling beyond
// a single process.
class ApiKeyRateLimiter {
  constructor({ now = () => Date.now() } = {}) {
    this._now = now
    this._state = new Map()
  }
  check(keyId, { perMinute, perDay }) {
    const now = this._now()
    let s = this._state.get(keyId) ?? { minute: { count: 0, windowStart: now }, day: { count: 0, windowStart: now } }
    if (now - s.minute.windowStart >= 60_000) s = { ...s, minute: { count: 0, windowStart: now } }
    if (now - s.day.windowStart >= 86_400_000) s = { ...s, day: { count: 0, windowStart: now } }
    if (s.minute.count >= perMinute) {
      return { allowed: false, retryAfter: Math.ceil((s.minute.windowStart + 60_000 - now) / 1000),
        limitPerMinute: perMinute, remainingMinute: 0, limitPerDay: perDay, remainingDay: Math.max(0, perDay - s.day.count) }
    }
    if (s.day.count >= perDay) {
      return { allowed: false, retryAfter: Math.ceil((s.day.windowStart + 86_400_000 - now) / 1000),
        limitPerMinute: perMinute, remainingMinute: Math.max(0, perMinute - s.minute.count), limitPerDay: perDay, remainingDay: 0 }
    }
    s = { minute: { ...s.minute, count: s.minute.count + 1 }, day: { ...s.day, count: s.day.count + 1 } }
    this._state.set(keyId, s)
    return { allowed: true, limitPerMinute: perMinute, remainingMinute: perMinute - s.minute.count,
      limitPerDay: perDay, remainingDay: perDay - s.day.count }
  }
}
module.exports = { ApiKeyRateLimiter, apiKeyRateLimiter: new ApiKeyRateLimiter() }
