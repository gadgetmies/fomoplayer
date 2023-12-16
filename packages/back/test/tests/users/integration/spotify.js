require('../../../lib/spotifyInterceptor').init()
const { test } = require('../../../lib/test')

const { spotifyApi, refreshToken } = require('../../../../routes/shared/spotify')

test({
  setup: async () => {
    await refreshToken()
  },
  'requests are intercepted': async () => {
    const res = await spotifyApi.search('noisia', ['track', 'artist', 'album'], { limit: 10 })
  }
})
