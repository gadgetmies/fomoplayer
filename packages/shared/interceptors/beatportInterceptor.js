const interceptor = require('./interceptor.js')
const { BeatportUrlRegex } = require('../integrations/beatport')
const beatportV4Search = require('./fixtures/beatport-v4-search.json')

const jsonMock = (pathname, body) => ({
  test: ({ pathname: requested }) => requested === pathname,
  getResponse: () => ({
    body: JSON.stringify(body),
    options: { headers: { 'content-type': 'application/json' } },
  }),
})

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
    mocks: [jsonMock('/v4/catalog/search/', beatportV4Search)],
    name: 'Beatport',
    regex: BeatportUrlRegex,
  })
}
