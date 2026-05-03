const assert = require('assert')
const { test } = require('cascade-test')
const { createCorsOriginValidator, parseOriginRegexes } = require('../../../../cors-origin')

const validateOrigin = (validator, origin) =>
  new Promise((resolve, reject) => {
    validator(origin, (err, allowed) => {
      if (err) {
        reject(err)
        return
      }
      resolve(allowed)
    })
  })

test({
  'parseOriginRegexes parses comma-separated regexes': () => {
    const regexes = parseOriginRegexes('^https://pr-[0-9]+\\.preview\\.example\\.com$,^https://preview\\.example\\.com$')
    assert.strictEqual(regexes.length, 2)
    assert.strictEqual(regexes[0].test('https://pr-42.preview.example.com'), true)
    assert.strictEqual(regexes[1].test('https://preview.example.com'), true)
  },

  'validator allows requests without origin': async () => {
    const validator = createCorsOriginValidator({ allowedOrigins: [] })
    const allowed = await validateOrigin(validator, undefined)
    assert.strictEqual(allowed, true)
  },

  'validator allows exact origin match': async () => {
    const validator = createCorsOriginValidator({ allowedOrigins: ['https://preview.example.com'] })
    const allowed = await validateOrigin(validator, 'https://preview.example.com')
    assert.strictEqual(allowed, true)
  },

  'validator allows regex origin match': async () => {
    const validator = createCorsOriginValidator({
      allowedOrigins: [],
      allowedOriginRegexes: parseOriginRegexes('^https://pr-[0-9]+\\.preview\\.example\\.com$'),
    })
    const allowed = await validateOrigin(validator, 'https://pr-77.preview.example.com')
    assert.strictEqual(allowed, true)
  },

  'validator rejects unknown origin': async () => {
    const validator = createCorsOriginValidator({ allowedOrigins: ['https://preview.example.com'] })
    await assert.rejects(
      async () => validateOrigin(validator, 'https://evil.example.com'),
      /CORS origin denied: https:\/\/evil\.example\.com/,
    )
  },

  'validator allows mixed-case origin against lowercased allowlist': async () => {
    const validator = createCorsOriginValidator({
      allowedOrigins: ['safari-web-extension://0504f00c-80ef-4657-a397-2b65004ad0d7'],
    })
    const allowed = await validateOrigin(
      validator,
      'safari-web-extension://0504F00C-80EF-4657-A397-2B65004AD0D7',
    )
    assert.strictEqual(allowed, true)
  },

  'validator allows mixed-case origin against lowercased regex': async () => {
    const validator = createCorsOriginValidator({
      allowedOrigins: [],
      allowedOriginRegexes: parseOriginRegexes(
        '^safari-web-extension://[0-9a-f-]{36}$',
      ),
    })
    const allowed = await validateOrigin(
      validator,
      'safari-web-extension://0504F00C-80EF-4657-A397-2B65004AD0D7',
    )
    assert.strictEqual(allowed, true)
  },
})
