require('fomoplayer_shared').interceptors.googleOAuth.init()
require('fomoplayer_shared').interceptors.spotify.init()
require('fomoplayer_shared').interceptors.beatport.init()
require('fomoplayer_shared').interceptors.bandcamp.init()

require('./tests/ui/login').run()