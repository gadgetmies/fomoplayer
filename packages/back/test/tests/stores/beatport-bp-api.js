const assert = require('assert')
const { test } = require('cascade-test')
const { staticFns } = require('../../../routes/stores/beatport/bp-api')

const getDetailsAsync = (url) =>
  new Promise((resolve, reject) =>
    staticFns.getDetails(url, (err, details) => (err ? reject(err) : resolve(details))),
  )

const withFetchMock = async (responseOverride, fn) => {
  const origFetch = global.fetch
  global.fetch = async () => ({
    status: responseOverride.status ?? 200,
    ok: responseOverride.ok ?? true,
    text: async () => responseOverride.text ?? '',
  })

  try {
    await fn()
  } finally {
    global.fetch = origFetch
  }
}

test({
  'getDetails keeps the full artist name from title': async () => {
    await withFetchMock(
      {
        text: '<html><head><title>Noisia music download - Beatport</title></head><body></body></html>',
      },
      async () => {
        const details = await getDetailsAsync('https://www.beatport.com/artist/noisia/1054')
        assert.strictEqual(details.name, 'Noisia')
      },
    )
  },
})
