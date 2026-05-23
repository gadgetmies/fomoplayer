const interceptor = require('./interceptor.js')
const { BeatportUrlRegex } = require('../integrations/beatport')
const beatportV4Search = require('./fixtures/beatport-v4-search.json')

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
        test: ({ pathname }) => pathname === '/v4/catalog/search/',
        getResponse: () => ({
          body: JSON.stringify(beatportV4Search),
          options: {
            headers: {
              'content-type': 'application/json',
            },
          },
        }),
      },
    ],
    name: 'Beatport',
    regex: BeatportUrlRegex,
  })
}
