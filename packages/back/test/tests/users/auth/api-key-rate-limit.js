'use strict'
const { expect } = require('chai')
const { test } = require('cascade-test')
const { ApiKeyRateLimiter } = require('../../../../routes/shared/api-key-rate-limiter')

test({
  'ApiKeyRateLimiter': {
    'allows requests under limit': () => {
      const rl = new ApiKeyRateLimiter()
      for (let i = 0; i < 5; i++) expect(rl.check('k1', { perMinute: 5, perDay: 100 }).allowed).to.be.true
    },
    'blocks at per-minute limit': () => {
      const rl = new ApiKeyRateLimiter()
      for (let i = 0; i < 3; i++) rl.check('k2', { perMinute: 3, perDay: 100 })
      const r = rl.check('k2', { perMinute: 3, perDay: 100 })
      expect(r.allowed).to.be.false
      expect(r.retryAfter).to.be.above(0)
    },
    'resets minute window after 60s': () => {
      let t = 0
      const rl = new ApiKeyRateLimiter({ now: () => t })
      for (let i = 0; i < 3; i++) rl.check('k3', { perMinute: 3, perDay: 100 })
      expect(rl.check('k3', { perMinute: 3, perDay: 100 }).allowed).to.be.false
      t = 60_001
      expect(rl.check('k3', { perMinute: 3, perDay: 100 }).allowed).to.be.true
    },
    'blocks at per-day limit': () => {
      const rl = new ApiKeyRateLimiter()
      for (let i = 0; i < 2; i++) rl.check('k4', { perMinute: 100, perDay: 2 })
      expect(rl.check('k4', { perMinute: 100, perDay: 2 }).allowed).to.be.false
    },
    'tracks keys independently': () => {
      const rl = new ApiKeyRateLimiter()
      for (let i = 0; i < 3; i++) rl.check('kA', { perMinute: 3, perDay: 100 })
      expect(rl.check('kB', { perMinute: 3, perDay: 100 }).allowed).to.be.true
    },
  },
})
