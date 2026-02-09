const interceptor = require('./interceptor.js')
const { BeatportUrlRegex } = require('../integrations/beatport')
const { readSync } = require('fs')
const fs = require('fs')
const path = require('path')

const beatportSearchMock = fs.readFileSync(path.resolve(`${__dirname}/fixtures/beatport-search.html`)).toString('utf-8')
const beatportArtistsSearchMock = fs
  .readFileSync(path.resolve(`${__dirname}/fixtures/beatport-artists-search.html`))
  .toString('utf-8')
const beatportLabelsSearchMock = fs
  .readFileSync(path.resolve(`${__dirname}/fixtures/beatport-labels-search.html`))
  .toString('utf-8')

module.exports.init = () => {
  const beatportRedirect = process.env.BEATPORT_API_REDIRECT
  const useMocks = process.env.BEATPORT_API_MOCK

  return interceptor.init({
    proxies: [
      {
        test: () => !useMocks,
        url: ({ url }) => {
          const u = new URL(url)
          u.host = beatportRedirect
          return u.toString()
        },
      },
    ],
    mocks: [
      {
        test: ({ pathname }) => pathname === '/search',
        getResponse: () => ({
          body: beatportSearchMock,
          options: {
            headers: {
              'content-type': 'text/html; charset=utf-8',
            },
          },
        }),
      },
      {
        test: ({ pathname }) => pathname === '/search/artists',
        getResponse: () => ({
          body: beatportArtistsSearchMock,
          options: {
            headers: {
              'content-type': 'text/html; charset=utf-8',
            },
          },
        }),
      },
      {
        test: ({ pathname }) => pathname === '/search/labels',
        getResponse: () => ({
          body: beatportLabelsSearchMock,
          options: {
            headers: {
              'content-type': 'text/html; charset=utf-8',
            },
          },
        }),
      },
    ],
    name: 'Beatport',
    regex: BeatportUrlRegex,
    beatportSearchMock,
    beatportArtistsSearchMock,
    beatportLabelsSearchMock,
  })
}
