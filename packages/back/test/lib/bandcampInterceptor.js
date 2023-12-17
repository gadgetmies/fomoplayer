const interceptor = require('./interceptor.js')
const { BandcampUrlRegex } = require('../../routes/shared/bandcamp')
const { readFileSync } = require('fs')
const fs = require('fs')
const path = require('path')

const bandcampNoisiaSearchMock = require('../fixtures/bandcamp-noisia-search.json')
const bandcampNoisiaMock = readFileSync(path.resolve(`${__dirname}/../fixtures/bandcamp-noisia.html`)).toString('utf-8')
const bandcampVisionMock = readFileSync(path.resolve(`${__dirname}/../fixtures/bandcamp-vision.html`)).toString('utf-8')
const bandcampF4kY00Mock = readFileSync(path.resolve(`${__dirname}/../fixtures/bandcamp-f4k-y00.html`)).toString(
  'utf-8'
)
const bandcampDifferentEyesMock = readFileSync(
  path.resolve(`${__dirname}/../fixtures/bandcamp-different-eyes.html`)
).toString('utf-8')
const bandcampResonanceVMock = readFileSync(
  path.resolve(`${__dirname}/../fixtures/bandcamp-resonance-v.html`)
).toString('utf-8')
const bandcampResonanceVIMock = readFileSync(
  path.resolve(`${__dirname}/../fixtures/bandcamp-resonance-vi.html`)
).toString('utf-8')

const bandcampRedirect = process.env.BANDCAMP_API_REDIRECT
const useMocks = process.env.BANDCAMP_API_MOCK

module.exports.init = () =>
  interceptor.init({
    proxies: [
      {
        test: () => !useMocks,
        url: ({ url }) => (new URL(url).host = bandcampRedirect)
      }
    ],
    mocks: [
      {
        test: ({ pathname }) => pathname === '/api/bcsearch_public_api/1/autocomplete_elastic',
        getResponse: () => ({
          body: bandcampNoisiaSearchMock,
          options: {
            headers: {
              'content-type': 'text/html; charset=utf-8'
            }
          }
        })
      },
      {
        test: ({ url }) => url === 'https://noisia.bandcamp.com/music',
        getResponse: () => ({
          body: bandcampNoisiaMock,
          options: {
            headers: {
              'content-type': 'text/html; charset=utf-8'
            }
          }
        })
      },
      {
        test: ({ url }) => url === 'https://noisia.bandcamp.com/album/the-resonance-vi',
        getResponse: () => ({
          body: bandcampResonanceVIMock,
          options: {
            headers: {
              'content-type': 'text/html; charset=utf-8'
            }
          }
        })
      },
      {
        test: ({ url }) => url === 'https://noisia.bandcamp.com/album/the-resonance-v',
        getResponse: () => ({
          body: bandcampResonanceVMock,
          options: {
            headers: {
              'content-type': 'text/html; charset=utf-8'
            }
          }
        })
      },
      {
        test: ({ url }) => url === 'https://visionrecordings.bandcamp.com/music',
        getResponse: () => ({
          body: bandcampVisionMock,
          options: {
            headers: {
              'content-type': 'text/html; charset=utf-8'
            }
          }
        })
      },
      {
        test: ({ url }) => url === 'https://billainaethek.bandcamp.com/album/f4k-y00?label=4289352950&tab=music',
        getResponse: () => ({
          body: bandcampF4kY00Mock,
          options: {
            headers: {
              'content-type': 'text/html; charset=utf-8'
            }
          }
        })
      },
      {
        test: ({ url }) =>
          url === 'https://billainaethek.bandcamp.com/album/different-eyes-ep?label=4289352950&tab=music',
        getResponse: () => ({
          body: bandcampDifferentEyesMock,
          options: {
            headers: {
              'content-type': 'text/html; charset=utf-8'
            }
          }
        })
      }
    ],
    name: 'Bandcamp',
    regex: BandcampUrlRegex,
    bandcampNoisiaSearchMock: bandcampNoisiaSearchMock,
    bandcampNoisiaMock: bandcampNoisiaMock,
    bandcampVisionMock: bandcampVisionMock
  })
