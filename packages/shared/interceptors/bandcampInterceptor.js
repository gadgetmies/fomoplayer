const interceptor = require('./interceptor.js')
const { BandcampUrlRegex } = require('../integrations/bandcamp')
const { readFileSync } = require('fs')
const path = require('path')

const bandcampNoisiaSearchMock = require('./fixtures/bandcamp-noisia-search.json')
const bandcampNoisiaMock = readFileSync(path.resolve(`${__dirname}/fixtures/bandcamp-noisia.html`)).toString('utf-8')
const bandcampVisionMock = readFileSync(path.resolve(`${__dirname}/fixtures/bandcamp-vision.html`)).toString('utf-8')
const bandcampF4kY00Mock = readFileSync(path.resolve(`${__dirname}/fixtures/bandcamp-f4k-y00.html`)).toString('utf-8')
const bandcampDifferentEyesMock = readFileSync(
  path.resolve(`${__dirname}/fixtures/bandcamp-different-eyes.html`)
).toString('utf-8')
const bandcampResonanceVMock = readFileSync(path.resolve(`${__dirname}/fixtures/bandcamp-resonance-v.html`)).toString(
  'utf-8'
)
const bandcampResonanceVIMock = readFileSync(path.resolve(`${__dirname}/fixtures/bandcamp-resonance-vi.html`)).toString(
  'utf-8'
)

const bandcampElectronicMock = readFileSync(path.resolve(`${__dirname}/fixtures/bandcamp-electronic.html`)).toString(
  'utf-8'
)
const bandcampAllMock = readFileSync(path.resolve(`${__dirname}/fixtures/bandcamp-all.html`)).toString('utf-8')
const bandcampAllDigitalMock = readFileSync(path.resolve(`${__dirname}/fixtures/bandcamp-all-digital.html`)).toString(
  'utf-8'
)
const bandcampElectronicDigitalMock = readFileSync(
  path.resolve(`${__dirname}/fixtures/bandcamp-electronic-digital.html`)
).toString('utf-8')
const bandcampElectronicDnbMock = readFileSync(
  path.resolve(`${__dirname}/fixtures/bandcamp-electronic-drum-and-bass.html`)
).toString('utf-8')
const bandcampElectronicDigitalDnbMock = readFileSync(
  path.resolve(`${__dirname}/fixtures/bandcamp-electronic-digital-drum-and-bass.html`)
).toString('utf-8')

const bandcampRedirect = process.env.BANDCAMP_API_REDIRECT
const useMocks = process.env.BANDCAMP_API_MOCK

const respondWith = (body, contentType = 'application/json') => () => ({
  body,
  options: {
    headers: {
      'content-type': contentType
    }
  }
})

const respondWithHTML = html => respondWith(html, 'text/html; charset=utf-8')

const HTMLmock = ([urlToMatch, html]) => ({
  test: ({ url }) => url === urlToMatch,
  getResponse: respondWithHTML(html)
})

const JSONmock = ([urlToMatch, json]) => ({
  test: ({ url }) => url === urlToMatch,
  getResponse: respondWith(json)
})

const getMocks = urlResponsePairs =>
  urlResponsePairs.map(([matcher, response]) => ({
    test: matcher instanceof Function ? matcher : ({ url: urlToMatch }) => matcher === urlToMatch,
    getResponse: respondWith(response, response instanceof Object ? 'application/json' : 'text/html; charset=utf-8')
  }))

module.exports.init = () =>
  interceptor.init({
    proxies: [
      {
        test: () => !useMocks,
        url: ({ url }) => (new URL(url).host = bandcampRedirect)
      }
    ],
    mocks: getMocks([
      [({ pathname }) => pathname === '/api/bcsearch_public_api/1/autocomplete_elastic', bandcampNoisiaSearchMock],
      ['https://noisia.bandcamp.com/music', bandcampNoisiaMock],
      ['https://noisia.bandcamp.com/album/the-resonance-vi', bandcampResonanceVIMock],
      ['https://noisia.bandcamp.com/album/the-resonance-v', bandcampResonanceVMock],
      ['https://visionrecordings.bandcamp.com/music', bandcampVisionMock],
      ['https://billainaethek.bandcamp.com/album/f4k-y00?label=4289352950&tab=music', bandcampF4kY00Mock],
      [
        'https://billainaethek.bandcamp.com/album/different-eyes-ep?label=4289352950&tab=music',
        bandcampDifferentEyesMock
      ],
      ['https://bandcamp.com/discover', bandcampAllMock],
      ['https://bandcamp.com/discover/all/digital', bandcampAllDigitalMock],
      ['https://bandcamp.com/discover/electronic', bandcampElectronicMock],
      ['https://bandcamp.com/discover/electronic/digital', bandcampElectronicDigitalMock],
      ['https://bandcamp.com/discover/electronic?tags=drum-bass', bandcampElectronicDnbMock],
      ['https://bandcamp.com/discover/electronic/digital?tags=drum-bass', bandcampElectronicDigitalDnbMock]
    ]),
    name: 'Bandcamp',
    regex: BandcampUrlRegex,
    bandcampNoisiaSearchMock: bandcampNoisiaSearchMock,
    bandcampNoisiaMock: bandcampNoisiaMock,
    bandcampVisionMock: bandcampVisionMock
  })
