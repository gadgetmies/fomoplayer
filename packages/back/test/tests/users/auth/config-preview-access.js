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
})

