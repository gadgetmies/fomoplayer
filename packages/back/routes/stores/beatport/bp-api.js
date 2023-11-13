const BPromise = require('bluebird')
const R = require('ramda')
const { init, initWithSession } = require('request-in-session')
const request = require('request-promise').defaults({ strictSSL: false, resolveWithFullResponse: true })
const { decode } = require('html-entities')

const beatportUri = 'https://www.beatport.com'
const loginUri = 'https://www.beatport.com/account/login'
const cookieUri = 'https://www.beatport.com/'
const csrfTokenKey = '_csrf_token'
const sessionCookieKey = 'session'

const handleErrorOrCallFn = R.curry((errorHandler, fn) => (err, res) => (err ? errorHandler(err) : fn(res)))

const scrapeJSON = R.curry((startString, stopString, string) => {
  const start = string.indexOf(startString) + startString.length
  const stop = string.indexOf(stopString, start)
  const text = string.substring(start, stop)
  // TODO: handle status code here?
  try {
    return JSON.parse(text)
  } catch (e) {
    console.error(`Failed to scrape JSON`, text)
    throw e
  }
})

const getQueryData = pageSource =>
  scrapeJSON('<script id="__NEXT_DATA__" type="application/json">', '</script>', pageSource)

const getPageTitleFromSource = pageSource => {
  const startString = '<title>'
  const start = pageSource.indexOf(startString)
  if (start !== -1) {
    const stop = pageSource.indexOf('</title>')
    return decode(pageSource.substring(start + startString.length, stop))
      .replace(' :: Beatport', '')
      .replace(' artists & music download - Beatport', '')
      .replace(' music download - Beatport', '')
  } else {
    const pageData = getQueryData(pageSource)
    const { artist, label, track, dehydratedState } = pageData.props.pageProps
    const playlist = R.pathOr(undefined, ['queries', '1', 'state', 'data'], dehydratedState)
    if (!artist && !label && !track && !playlist) {
      throw new Error('Unable to extract page title!')
    }
    return (artist || label || track || playlist).name
  }
}

const getImageFromSource = pageSource => {
  const pageData = getQueryData(pageSource)
  const { artist, label } = pageData.props.pageProps
  if (!artist && !label) {
    throw new Error('Unable to extract page title!')
  }
  return (artist || label).image.uri
}

const getDetails = (uri, callback) =>
  request(
    uri,
    handleErrorOrCallFn(callback, res => {
      try {
        if (Math.floor(res.statusCode / 100) < 4) {
          const name = getPageTitleFromSource(res.body)
          let img
          try {
            img = getImageFromSource(res.body)
          } catch (e) {
            console.error(`Unable to find image for uri: ${uri}`)
          }
          return callback(null, { name, img })
        } else {
          const message = `Request returned error status. URL: ${uri}`
          console.error(message)
          callback(new Error(message))
        }
      } catch (e) {
        console.error(`Failed to fetch details for uri: ${uri}`, e)
        callback(e)
      }
    })
  )

const getTitle = (uri, callback) =>
  request(
    uri,
    handleErrorOrCallFn(callback, res => {
      try {
        if (Math.floor(res.statusCode / 100) < 4) {
          return callback(null, getPageTitleFromSource(res.body))
        } else {
          const message = `Request returned error status. URL: ${uri}`
          console.error(message)
          callback(new Error(message))
        }
      } catch (e) {
        console.error('Failed to fetch the page title', e)
        callback(e)
      }
    })
  )

const getArtistQueryData = (artistId, page = 1, callback) => {
  const uri = `${beatportUri}/artist/_/${artistId}/tracks?per-page=50&page=${page}`
  request(
    uri,
    handleErrorOrCallFn(callback, res => {
      try {
        if (Math.floor(res.statusCode / 100) < 4) {
          let queryData = getQueryData(res.body)
          return callback(null, queryData)
        } else {
          const message = `Request returned error status. URL: ${uri}`
          console.error(message)
          callback(new Error(message))
        }
      } catch (e) {
        console.error(`Failed fetching details from ${uri}`, e)
        callback(e)
      }
    })
  )
}

const getLabelQueryData = (labelId, page = 1, callback) => {
  const uri = `${beatportUri}/label/_/${labelId}/tracks?per-page=50&page=${page}`
  console.log(`Fetching label details from ${uri}`)
  request(
    uri,
    handleErrorOrCallFn(callback, res => {
      try {
        if (Math.floor(res.statusCode / 100) < 4) {
          return callback(null, getQueryData(res.body))
        } else {
          const message = `Request returned error status. URL: ${uri}`
          console.error(message)
          callback(new Error(message))
        }
      } catch (e) {
        console.error(`Failed fetching details from ${uri}`, e)
        callback(e)
      }
    })
  )
}

const getSearchResults = (html, type) => {
  const queryData = getQueryData(html)
  const results = queryData.props.pageProps.dehydratedState.queries[0].state.data.data

  return results.map(({ label_name, artist_name, label_id, artist_id, label_image_uri, artist_image_uri }) => {
    const name = label_name || artist_name
    const id = label_id || artist_id
    return {
      type,
      id,
      name,
      img: label_image_uri || artist_image_uri,
      url: `${beatportUri}/${type}/${encodeURI(name.toLowerCase().replace(' ', '-'))}/${id}`
    }
  })
}

const search = (query, type, callback) => {
  const uri = `${beatportUri}/search/${type}s?q=${query}`
  console.log(`Performing Beatport search: ${uri}`)
  request(
    uri,
    handleErrorOrCallFn(callback, res => {
      try {
        if (Math.floor(res.statusCode / 100) < 4) {
          return callback(null, getSearchResults(res.body, type))
        } else {
          const message = `Request returned error status. URL: ${uri}`
          console.error(message)
          callback(new Error(message))
        }
      } catch (e) {
        console.error(`Failed fetching search results from ${uri}`, e)
        callback(e)
      }
    })
  ).catch(e => {
    callback(e)
  })
}

const searchForArtists = (query, callback) => search(query, 'artist', callback)
const searchForLabels = (query, callback) => search(query, 'label', callback)

const getQueryDataOnPage = (uri, callback) => {
  request(
    uri,
    handleErrorOrCallFn(callback, res => {
      try {
        const data = getQueryData(res.body)
        const title = getPageTitleFromSource(res.body)
        return callback(null, { data, title })
      } catch (e) {
        console.error(`Failed fetching details from ${uri}`, e)
        callback(e)
      }
    })
  ).catch(e => {
    console.error(e)
    callback(e)
  })
}

const getApi = session => {
  const getJsonAsync = BPromise.promisify(session.getJson)
  const api = {
    getMyBeatport: callback => session.getJson(`${beatportUri}/api/my-beatport`, callback),
    getMyBeatportTracks: (page, callback) =>
      session.get(
        `${beatportUri}/my-beatport?page=${page}&_pjax=%23pjax-inner-wrapper`,
        handleErrorOrCallFn(callback, res => {
          return callback(null, getQueryData(res))
        })
      ),
    getItemsInCarts: callback =>
      session.getJson(
        `${beatportUri}/api/cart/cart`,
        handleErrorOrCallFn(callback, res => {
          BPromise.map(res.carts.map(R.prop('id')), cartId => getJsonAsync(`${beatportUri}/api/cart/${cartId}`))
            .map(({ items }) => R.pluck('id', items))
            .then(R.flatten)
            .tap(idsOfItemsInCart => callback(null, idsOfItemsInCart))
            .catch(err => callback(err))
        })
      ),
    getTrack: (trackId, callback) => session.getJson(`https://embed.beatport.com/track?id=${trackId}`, callback),
    getClip: (trackId, callback) =>
      api.getTrack(
        trackId,
        handleErrorOrCallFn(callback, res => callback(null, res.results.preview))
      ),
    addTrackToCart: (trackId, cartId, callback) =>
      session.postJson(
        `${beatportUri}/api/${cartId}`,
        {
          items: [{ type: 'track', id: trackId }]
        },
        handleErrorOrCallFn(callback, res => callback(null, res))
      ),
    removeTrackFromCart: (trackId, cartId, callback) =>
      session.deleteJson(
        `${beatportUri}/api/cart/${cartId}`,
        {
          items: [{ type: 'track', id: trackId }]
        },
        handleErrorOrCallFn(callback, res => callback(null, res))
      ),
    getAvailableDownloadIds: (page = 1, callback) =>
      session.get(
        `${beatportUri}/downloads/available?page=${page}&per-page=1000`,
        handleErrorOrCallFn(callback, res => callback(null, getQueryData(res)))
      ),
    getDownloadedTracks: (page = 1, callback) =>
      session.get(
        `${beatportUri}/downloads/downloaded?page=${page}&per-page=1000`,
        handleErrorOrCallFn(callback, res => callback(null, getQueryData(res)))
      ),
    downloadTrackWithId: (downloadId, callback) =>
      getJsonAsync(`${beatportUri}/api/downloads/purchase?downloadId=${downloadId}`)
        .then(R.prop('download_url'))
        .then(downloadUrl => session.getBlob(downloadUrl, callback))
        .catch(err => callback(err)),
    getArtistQueryData,
    getLabelQueryData,
    searchForArtists,
    searchForLabels
  }

  return api
}

const handleCreateSessionResponse = callback => (err, session) => {
  if (err) {
    return callback(err)
  }
  const api = getApi(session)
  const ensureLoginSuccessful = () =>
    api.getMyBeatport(err => {
      if (err) {
        callback(err)
      } else {
        callback(null, api)
      }
    })

  return ensureLoginSuccessful()
}

const initializers = {
  init: (username, password, callback) => {
    return init(
      cookieUri,
      loginUri,
      username,
      password,
      csrfTokenKey,
      sessionCookieKey,
      handleCreateSessionResponse(callback)
    )
  },
  initWithSession: (sessionCookieValue, csrfToken, callback) => {
    return initWithSession(
      { [sessionCookieKey]: sessionCookieValue, [csrfTokenKey]: csrfToken },
      cookieUri,
      handleCreateSessionResponse(callback)
    )
  },
  initAsync: (username, password) =>
    BPromise.promisify(initializers.init)(username, password).then(api => BPromise.promisifyAll(api)),
  initWithSessionAsync: (sessionCookieValue, csrfToken) =>
    BPromise.promisify(initializers.initWithSession)(sessionCookieValue, csrfToken).then(api =>
      BPromise.promisifyAll(api)
    )
}

const staticFns = {
  getArtistQueryData,
  getLabelQueryData,
  getQueryDataOnPage,
  getTitle,
  getDetails,
  searchForArtists,
  searchForLabels
}

module.exports = { ...initializers, staticFns }
