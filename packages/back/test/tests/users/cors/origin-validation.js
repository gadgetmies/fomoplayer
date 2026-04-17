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

  'parseOriginRegexes anchors unanchored patterns': () => {
    const regexes = parseOriginRegexes('https://preview\\.example\\.com')
    assert.strictEqual(regexes.length, 1)
    assert.strictEqual(regexes[0].test('https://preview.example.com'), true)
    assert.strictEqual(regexes[0].test('https://preview.example.com.evil.com'), false)
    assert.strictEqual(regexes[0].test('https://evil.com/preview.example.com'), false)
  },

  'parseOriginRegexes preserves patterns that already have anchors': () => {
    const regexes = parseOriginRegexes('^https://preview\\.example\\.com$')
    assert.strictEqual(regexes.length, 1)
    assert.strictEqual(regexes[0].test('https://preview.example.com'), true)
    assert.strictEqual(regexes[0].test('https://preview.example.com.evil.com'), false)
  },

  'validator rejects subdomain-smuggling origin via regex': async () => {
    const validator = createCorsOriginValidator({
      allowedOrigins: [],
      allowedOriginRegexes: parseOriginRegexes('https://preview\\.example\\.com'),
    })
    await assert.rejects(
      async () => validateOrigin(validator, 'https://preview.example.com.attacker.com'),
      /CORS origin denied: https:\/\/preview\.example\.com\.attacker\.com/,
    )
  },

  'validator rejects origin containing a path component via regex': async () => {
    const validator = createCorsOriginValidator({
      allowedOrigins: [],
      allowedOriginRegexes: parseOriginRegexes('https://preview\\.example\\.com'),
    })
    await assert.rejects(
      async () => validateOrigin(validator, 'https://evil.com/preview.example.com'),
      /CORS origin denied: https:\/\/evil\.com\/preview\.example\.com/,
    )
  },

  'parseOriginRegexes handles wildcard subdomain pattern': () => {
    const regexes = parseOriginRegexes('https://pr-[0-9]+\\.preview\\.example\\.com')
    assert.strictEqual(regexes.length, 1)
    assert.strictEqual(regexes[0].test('https://pr-42.preview.example.com'), true)
    assert.strictEqual(regexes[0].test('https://pr-42.preview.example.com.evil.com'), false)
  },
})
