const BPromise = require('bluebird')
const R = require('ramda')
const { initWithSession } = require('request-in-session')
const saferEval = require('safer-eval')
const { log, error } = require('./logger')
const rootUri = 'https://bandcamp.com'

const scrapeJSON = R.curry((startString, stopString, string) => {
  const start = string.indexOf(startString) + startString.length
  const stop = string.indexOf(stopString, start)
  const javascriptString = string.substring(start, stop + stopString.length - 1).replace(/&quot;/g, '"')
  return saferEval(javascriptString)
})

const request = require("request-promise")

const getAlbumInfo = pageSource => scrapeJSON('data-tralbum="', '}"', pageSource)
const getAlbum = (itemUrl, callback) => {
  return request({
    method: 'GET',
    uri: itemUrl
  }).then(res => {
    callback(null, { ...getAlbumInfo(res), url: itemUrl })
  })
  .catch(e => {
    callback(e)
  })
}

const handleErrorOrCallFn = R.curry((errorHandler, fn) => (err, res) => (err ? errorHandler(err) : fn(res)))

const getApi = session => {
  const api = {
    getFanId: callback =>
      session.getJson(
        `${rootUri}/api/fan/2/collection_summary`,
        handleErrorOrCallFn(callback, res => (res.error ? callback(res) : callback(null, res.fan_id)))
      ),
    getStories: (
      fan_id,
      since,
      callback // TODO: get tracks from entries instead from track_list
    ) =>
      session.postForm(
        `${rootUri}/fan_dash_feed_updates`,
        {
          fan_id,
          older_than: since
        },
        handleErrorOrCallFn(callback, res => {
          return callback(null, JSON.parse(res).stories.filter(R.propEq('story_type', 'nr')))
        })
      ),
    getAlbum
    // TODO: Move implementation from application logic to here!
    // getPreview: (callback) =>
    //   session.get()
  }

  return api
}

const handleCreateSessionResponse = callback => (err, session) => {
  if (err) {
    return callback(err)
  }
  const api = getApi(session)

  return api.getFanId((err, res) => {
    if (err) {
      return callback(err)
    } else {
      return callback(null, api)
    }
  })
}

const initializers = {
  initWithSession: (cookieProperties, callback) => {
    return initWithSession(cookieProperties, rootUri, handleCreateSessionResponse(callback))
  },
  initWithSessionAsync: cookieProperties =>
    BPromise.promisify(initializers.initWithSession)(cookieProperties).then(api => BPromise.promisifyAll(api))
}

const statics = {
  getAlbum,
  getAlbumAsync: BPromise.promisify(getAlbum)
}

module.exports = {
  ...initializers,
  ...statics
}
