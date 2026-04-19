const assert = require('assert')
const { test } = require('cascade-test')

const { isSafeRedirectPath, isSafeHandoffTarget } = require('../../../../routes/shared/safe-redirect')

const BASE = 'https://app.example.com'
const PREVIEW_A = 'https://preview-a.example.com'
const PREVIEW_B = 'https://preview-b.example.com'

test({
  'relative path is allowed': () => {
    assert.strictEqual(isSafeRedirectPath('/some/path', BASE), true)
  },

  'root path is allowed': () => {
    assert.strictEqual(isSafeRedirectPath('/', BASE), true)
  },

  'empty string is rejected': () => {
    assert.strictEqual(isSafeRedirectPath('', BASE), false)
  },

  'null is rejected': () => {
    assert.strictEqual(isSafeRedirectPath(null, BASE), false)
  },

  'absolute URL matching single trusted origin is allowed': () => {
    assert.strictEqual(isSafeRedirectPath(`${BASE}/dashboard`, BASE), true)
  },

  'absolute URL matching one of multiple trusted origins is allowed (cross-env preview)': () => {
    assert.strictEqual(isSafeRedirectPath(`${PREVIEW_A}/dashboard`, [PREVIEW_B, PREVIEW_A]), true)
  },

  'absolute URL not in trusted origins list is rejected': () => {
    assert.strictEqual(isSafeRedirectPath('https://evil.com/', [PREVIEW_B, PREVIEW_A]), false)
  },

  'protocol-relative // URL matching trusted origin is allowed': () => {
    assert.strictEqual(isSafeRedirectPath('//app.example.com/path', BASE), true)
  },

  'protocol-relative // URL for different host is rejected': () => {
    assert.strictEqual(isSafeRedirectPath('//evil.com/path', BASE), false)
  },

  'path with backslash is rejected (browser normalisation bypass)': () => {
    assert.strictEqual(isSafeRedirectPath('/\\evil.com', BASE), false)
  },

  'path that does not start with / is rejected': () => {
    assert.strictEqual(isSafeRedirectPath('evil.com', BASE), false)
  },

  'http:// URL for untrusted host is rejected': () => {
    assert.strictEqual(isSafeRedirectPath('http://evil.com/', BASE), false)
  },
})

const withRailwayEnv = (fn) => {
  process.env.RAILWAY_SERVICE_NAME = 'fomoplayer'
  process.env.RAILWAY_PROJECT_NAME = 'fomoplayer'
  try {
    fn()
  } finally {
    delete process.env.RAILWAY_SERVICE_NAME
    delete process.env.RAILWAY_PROJECT_NAME
  }
}

test({
  'isSafeHandoffTarget — valid Railway PR URL is accepted': () => {
    withRailwayEnv(() => {
      assert.strictEqual(isSafeHandoffTarget('https://fomoplayer-fomoplayer-pr-158.up.railway.app'), true)
    })
  },

  'isSafeHandoffTarget — any PR number is accepted': () => {
    withRailwayEnv(() => {
      assert.strictEqual(isSafeHandoffTarget('https://fomoplayer-fomoplayer-pr-1.up.railway.app'), true)
      assert.strictEqual(isSafeHandoffTarget('https://fomoplayer-fomoplayer-pr-99999.up.railway.app'), true)
    })
  },

  'isSafeHandoffTarget — non-PR Railway URL is rejected': () => {
    withRailwayEnv(() => {
      assert.strictEqual(isSafeHandoffTarget('https://fomoplayer-fomoplayer.up.railway.app'), false)
    })
  },

  'isSafeHandoffTarget — different project name is rejected': () => {
    withRailwayEnv(() => {
      assert.strictEqual(isSafeHandoffTarget('https://other-project-pr-1.up.railway.app'), false)
    })
  },

  'isSafeHandoffTarget — pattern is anchored: cannot prepend to bypass': () => {
    withRailwayEnv(() => {
      assert.strictEqual(
        isSafeHandoffTarget('https://evil.fomoplayer-fomoplayer-pr-1.up.railway.app'),
        false,
      )
    })
  },

  'isSafeHandoffTarget — pattern is anchored: cannot append to bypass': () => {
    withRailwayEnv(() => {
      assert.strictEqual(
        isSafeHandoffTarget('https://fomoplayer-fomoplayer-pr-1.up.railway.app.evil.com'),
        false,
      )
    })
  },

  'isSafeHandoffTarget — http:// is rejected (https only)': () => {
    withRailwayEnv(() => {
      assert.strictEqual(isSafeHandoffTarget('http://fomoplayer-fomoplayer-pr-1.up.railway.app'), false)
    })
  },

  'isSafeHandoffTarget — non-integer PR suffix is rejected': () => {
    withRailwayEnv(() => {
      assert.strictEqual(isSafeHandoffTarget('https://fomoplayer-fomoplayer-pr-abc.up.railway.app'), false)
    })
  },

  'isSafeHandoffTarget — returns false when Railway env vars are absent': () => {
    assert.strictEqual(isSafeHandoffTarget('https://fomoplayer-fomoplayer-pr-1.up.railway.app'), false)
  },

  'isSafeHandoffTarget — null is rejected': () => {
    withRailwayEnv(() => {
      assert.strictEqual(isSafeHandoffTarget(null), false)
    })
  },
})
