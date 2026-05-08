const assert = require('assert')
const path = require('path')
const { spawnSync } = require('child_process')
const { test } = require('cascade-test')

const configPath = path.resolve(__dirname, '../../../../config.js')

const TAIL_LINES = 20

const tailOutput = (result) => {
  const combined = `${result.stderr || ''}${result.stdout || ''}`
  const lines = combined.split('\n')
  const tail = lines.slice(-TAIL_LINES).join('\n')
  return `exit status ${result.status}, last ${TAIL_LINES} lines of output:\n${tail}`
}

const HANDOFF_PROBE = `const config = require(${JSON.stringify(configPath)});
console.log(JSON.stringify({
  oidcHandoffSecret: config.oidcHandoffSecret,
  oidcHandoffUrl: config.oidcHandoffUrl,
  oidcHandoffAuthorityOrigin: config.oidcHandoffAuthorityOrigin,
  allowedPreviewOriginRegexCount: (config.allowedPreviewOriginRegexes || []).length,
}))`

const parseHandoffProbe = (result) => {
  const stdout = result.stdout || ''
  const lastLine = stdout.trim().split('\n').pop()
  return JSON.parse(lastLine)
}

test({
  'config throws when PREVIEW_ENV=true and preview allowlist is empty': async () => {
    const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(configPath)})`], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PREVIEW_ENV: 'true',
        PREVIEW_ALLOWED_GOOGLE_SUBS: '',
      },
      encoding: 'utf8',
    })

    assert.notStrictEqual(result.status, 0, tailOutput(result))
    const combinedOutput = `${result.stderr || ''}${result.stdout || ''}`
    assert.match(combinedOutput, /PREVIEW_ALLOWED_GOOGLE_SUBS must be set when PREVIEW_ENV=true/)
  },

  'config loads when PREVIEW_ENV=true and preview allowlist has values': async () => {
    const result = spawnSync(
      process.execPath,
      ['-e', `const config = require(${JSON.stringify(configPath)}); console.log(config.previewAllowedGoogleSubs.length);`],
      {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          PREVIEW_ENV: 'true',
          PREVIEW_ALLOWED_GOOGLE_SUBS: '123,456',
        },
        encoding: 'utf8',
      },
    )

    assert.strictEqual(result.status, 0, tailOutput(result))
    assert.match(result.stdout || '', /2/)
  },

  'config loads cleanly when PREVIEW_ENV is unset and AUTH_API_URL differs from apiOrigin': async () => {
    const result = spawnSync(process.execPath, ['-e', HANDOFF_PROBE], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PREVIEW_ENV: '',
        // AUTH_API_URL points at a different origin than the test API_URL
        // (.env.test sets API_URL=http://localhost). This is the local-dev-on-different-ports case.
        AUTH_API_URL: 'http://localhost:3000/api',
        OIDC_HANDOFF_SECRET: '',
        ALLOWED_PREVIEW_ORIGIN_REGEX: '',
      },
      encoding: 'utf8',
    })

    assert.strictEqual(result.status, 0, tailOutput(result))
    const probe = parseHandoffProbe(result)
    assert.strictEqual(probe.oidcHandoffSecret, undefined)
    assert.strictEqual(probe.oidcHandoffUrl, undefined)
    assert.strictEqual(probe.oidcHandoffAuthorityOrigin, undefined)
    assert.strictEqual(probe.allowedPreviewOriginRegexCount, 0)
  },

  'stale handoff env vars are ignored when PREVIEW_ENV is unset': async () => {
    const result = spawnSync(process.execPath, ['-e', HANDOFF_PROBE], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PREVIEW_ENV: '',
        // Simulate a developer with leftover deploy-config env vars in their shell.
        OIDC_HANDOFF_SECRET: 'leaked-from-shell',
        ALLOWED_PREVIEW_ORIGIN_REGEX: '^https://example\\.com$',
      },
      encoding: 'utf8',
    })

    assert.strictEqual(result.status, 0, tailOutput(result))
    const probe = parseHandoffProbe(result)
    assert.strictEqual(
      probe.oidcHandoffSecret,
      undefined,
      'handoff secret must be undefined even when shell env has it set, since PREVIEW_ENV is unset',
    )
    assert.strictEqual(probe.allowedPreviewOriginRegexCount, 0)
  },

  'config exposes handoff values when PREVIEW_ENV=true and the handoff env vars are set': async () => {
    const result = spawnSync(process.execPath, ['-e', HANDOFF_PROBE], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PREVIEW_ENV: 'true',
        PREVIEW_ALLOWED_GOOGLE_SUBS: '123,456',
        OIDC_HANDOFF_SECRET: 'opt-in-secret',
        ALLOWED_PREVIEW_ORIGIN_REGEX: '^https://example\\.com$',
        // AUTH_API_URL matches apiOrigin → authority shape, validator passes.
        AUTH_API_URL: '',
      },
      encoding: 'utf8',
    })

    assert.strictEqual(result.status, 0, tailOutput(result))
    const probe = parseHandoffProbe(result)
    assert.strictEqual(probe.oidcHandoffSecret, 'opt-in-secret')
    assert.strictEqual(probe.allowedPreviewOriginRegexCount, 1)
  },
})

