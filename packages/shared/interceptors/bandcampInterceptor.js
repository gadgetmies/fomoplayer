const interceptor = require('./interceptor.js')
const { BandcampUrlRegex } = require('../integrations/bandcamp')
const { readFileSync } = require('fs')
const path = require('path')

const bandcampNoisiaSearchMock = require('./fixtures/bandcamp-noisia-search.json')
const bandcampNoisiaMock = readFileSync(path.resolve(`${__dirname}/fixtures/bandcamp-noisia.html`)).toString('utf-8')
const bandcampVisionMock = readFileSync(path.resolve(`${__dirname}/fixtures/bandcamp-vision.html`)).toString('utf-8')
const bandcampF4kY00Mock = readFileSync(path.resolve(`${__dirname}/fixtures/bandcamp-f4k-y00.html`)).toString('utf-8')
const bandcampDifferentEyesMock = readFileSync(
  path.resolve(`${__dirname}/fixtures/bandcamp-different-eyes.html`),
).toString('utf-8')
const bandcampResonanceVMock = readFileSync(path.resolve(`${__dirname}/fixtures/bandcamp-resonance-v.html`)).toString(
  'utf-8',
)
const bandcampResonanceVIMock = readFileSync(path.resolve(`${__dirname}/fixtures/bandcamp-resonance-vi.html`)).toString(
  'utf-8',
)

const bandcampDiscoverMock = require('./fixtures/bandcamp-discover.json')

// Release details come from Bandcamp's JSON endpoint, keyed by the item id the
// backend reads off the /music page tiles; these fixtures pair with the album
// tiles in the HTML fixtures above.
const bandcampTralbumMocks = {
  3222376539: require('./fixtures/bandcamp-tralbum-the-resonance-vi.json'),
  1144765497: require('./fixtures/bandcamp-tralbum-the-resonance-v.json'),
  3959806045: require('./fixtures/bandcamp-tralbum-f4k-y00.json'),
  1051734106: require('./fixtures/bandcamp-tralbum-different-eyes.json'),
}

const tralbumDetailsMock = {
  test: ({ pathname }) => pathname === '/api/mobile/24/tralbum_details',
  getResponse: ({ body }) => {
    const { tralbum_id } = body ? JSON.parse(body) : {}
    const tralbum = bandcampTralbumMocks[tralbum_id]
    return {
      body: JSON.stringify(tralbum || { error: true, error_message: `no tralbum fixture for ${tralbum_id}` }),
      options: { status: tralbum ? 200 : 404, headers: { 'content-type': 'application/json' } },
    }
  },
}

const respondWith =
  (body, contentType = 'application/json') =>
  () => ({
    body,
    options: {
      headers: {
        'content-type': contentType,
      },
    },
  })

const respondWithHTML = (html) => respondWith(html, 'text/html; charset=utf-8')

const HTMLmock = ([urlToMatch, html]) => ({
  test: ({ url }) => url === urlToMatch,
  getResponse: respondWithHTML(html),
})

const JSONmock = ([urlToMatch, json]) => ({
  test: ({ url }) => url === urlToMatch,
  getResponse: respondWith(json),
})

const getMocks = (urlResponsePairs) =>
  urlResponsePairs.map(([matcher, response]) => ({
    test: matcher instanceof Function ? matcher : ({ url: urlToMatch }) => matcher === urlToMatch,
    getResponse: respondWith(response, response instanceof Object ? 'application/json' : 'text/html; charset=utf-8'),
  }))

module.exports.init = () => {
  const bandcampRedirect = process.env.BANDCAMP_API_REDIRECT
  const useMocks = process.env.BANDCAMP_API_MOCK

  return interceptor.init({
    proxies: [
      {
        test: () => !useMocks,
        url: ({ url }) => {
          const u = new URL(url)
          u.host = bandcampRedirect
          return u.toString()
        },
      },
    ],
    mocks: [
      tralbumDetailsMock,
      ...getMocks([
      [({ pathname }) => pathname === '/api/bcsearch_public_api/1/autocomplete_elastic', bandcampNoisiaSearchMock],
      ['https://noisia.bandcamp.com/music', bandcampNoisiaMock],
      ['https://noisia.bandcamp.com/album/the-resonance-vi', bandcampResonanceVIMock],
      ['https://noisia.bandcamp.com/album/the-resonance-v', bandcampResonanceVMock],
      ['https://visionrecordings.bandcamp.com/music', bandcampVisionMock],
      ['https://billainaethek.bandcamp.com/album/f4k-y00?label=4289352950&tab=music', bandcampF4kY00Mock],
      [
        'https://billainaethek.bandcamp.com/album/different-eyes-ep?label=4289352950&tab=music',
        bandcampDifferentEyesMock,
      ],
      [({ pathname }) => pathname === '/api/discover/1/discover_web', bandcampDiscoverMock],
      ]),
    ],
    name: 'Bandcamp',
    regex: BandcampUrlRegex,
    bandcampNoisiaSearchMock: bandcampNoisiaSearchMock,
    bandcampNoisiaMock: bandcampNoisiaMock,
    bandcampVisionMock: bandcampVisionMock,
  })
}
