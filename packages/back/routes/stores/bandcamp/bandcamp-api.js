const BPromise = require('bluebird')
const R = require('ramda')
const logger = require('fomoplayer_shared').logger(__filename)
const { decode } = require('html-entities')
const jsdom = require('jsdom')
const { JSDOM } = jsdom
const { VM } = require('vm2')

const vm = new VM()
let suspendedUntil = null
let requestCount = 0

const cache = new Map()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

const getFromCache = (key) => {
  const cached = cache.get(key)
  if (cached && cached.expiry > Date.now()) {
    return cached.value
  }
  cache.delete(key)
  return null
}

const setToCache = (key, value) => {
  cache.set(key, { value, expiry: Date.now() + CACHE_TTL })
}

setInterval(() => {
  const now = Date.now()
  for (const [key, cached] of cache.entries()) {
    if (cached.expiry < now) {
      cache.delete(key)
    }
  }
}, 10 * 60 * 1000) // Clean every 10 minutes

const scrapeJSON = R.curry((pattern, string) => {
  const match = string.match(new RegExp(pattern), 's')
  if (match === null) {
    throw new Error('No match for pattern')
  }

  return vm.run(match[1])
})

const extractJSON = R.curry((selector, attribute = undefined, html) => {
  const dom = new JSDOM(html)
  const element = dom.window.document.querySelector(selector)
  const text = attribute ? element.getAttribute(attribute) : element.textContent
  return JSON.parse(text)
})

const request = require('request-promise')

const getPageSource = (url) => {
  if (suspendedUntil) {
    if (suspendedUntil < Date.now()) {
      suspendedUntil = null
      requestCount = 0
    } else {
      const error = new Error(`Rate limit reached. Requests are suspended until: ${suspendedUntil.toString()}`)
      error.isRateLimit = true
      return Promise.reject(error)
    }
  }
  requestCount++
  return request({
    method: 'GET',
    uri: url,
  }).catch((e) => {
    if ([429, 403].includes(e.statusCode)) {
      suspendedUntil = new Date(Date.now() + 10 /* minutes */ * 60 * 1000)
      logger.error(`Rate limit reached after ${requestCount} requests. Status code: ${e.statusCode}. Requests are suspended until: ${suspendedUntil.toString()}`)
      const error = new Error(`Rate limit reached after ${requestCount} requests. Status code: ${e.statusCode}. Requests are suspended until: ${suspendedUntil.toString()}`)
      error.isRateLimit = true
      error.statusCode = e.statusCode
      error.requestCount = requestCount
      throw error
    } else {
      throw e
    }
  })
}

const isRateLimited = () => {
  return suspendedUntil !== null && suspendedUntil >= Date.now()
}

const getReleaseInfo = (pageSource) => extractJSON('[data-tralbum]', 'data-tralbum', pageSource)
const getRelease = (itemUrl, callback) => {
  const cacheKey = `release:${itemUrl}`
  const cached = getFromCache(cacheKey)
  if (cached) return callback(null, cached)

  return getPageSource(itemUrl)
    .then((res) => {
      const releaseInfo = { ...getReleaseInfo(res), url: itemUrl }
      setToCache(cacheKey, releaseInfo)
      callback(null, releaseInfo)
    })
    .catch((e) => {
      logger.error(`Fetching release from ${itemUrl} failed`, { statusCode: e.statusCode })
      callback(e)
    })
}

const getName = (dom) => {
  const siteNameElement = dom.window.document.querySelector('[property="og:site_name"]')
  const nameFromTitle = dom.window.document.title && dom.window.document.title.split(' | ')[1]
  return (siteNameElement !== null && siteNameElement.getAttribute('content')) || nameFromTitle
}

const getReleaseUrls = (host, dom) => {
  const items = dom.window.document.querySelectorAll('#music-grid a, .featured-grid a, .results-grid-item a')
  return Array.from(items).map((i) => new URL(i.getAttribute('href'), host).toString())
}

const getIdFromUrl = (url) => url.substring(0, url.indexOf('.'))

const getPageInfo = (url, callback) => {
  const cacheKey = `pageInfo:${url}`
  const cached = getFromCache(cacheKey)
  if (cached) return callback(null, cached)

  const id = getIdFromUrl(url)
  getPageSource(url + '/music')
    .then((res) => {
      const dom = new JSDOM(res)
      const pageInfo = {
        id,
        name: getName(dom),
        releaseUrls: getReleaseUrls(url, dom),
      }
      setToCache(cacheKey, pageInfo)
      return callback(null, pageInfo)
    })
    .catch((e) => {
      callback(e)
    })
}

const getTagUrl = function (tags) {
  return `https://bandcamp.com/discover/${tags.genre}${tags.format ? `/${tags.format}` : ''}${
    tags.subgenre ? `?tags=${tags.subgenre}` : ''
  }`
}

const getTagsFromUrl = function (playlistUrl) {
  const match = playlistUrl.match(/^https:\/\/bandcamp.com\/discover\/(([^/?]+)\/?)?([^/?]*)?(\?tags=([^/?]+))?/)
  const subgenre = match[5]
  const format = match[3]
  const genre = match[2]
  return { genre, subgenre, format }
}

const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1)

const getTagName = (tags) =>
  capitalize(`${tags.genre || 'all'}${tags.subgenre ? ` / ${tags.subgenre}` : ''} (${tags.format || 'all formats'})`)

const getTagDetails = (tags, callback) => {
  callback(null, {
    id: getTagUrl(tags),
    name: getTagName(tags),
  })
}

const getTagReleases = (tags, callback) => {
  const url = getTagUrl(tags instanceof String ? JSON.parse(tags) : tags)
  const cacheKey = `tagReleases:${url}`
  const cached = getFromCache(cacheKey)
  if (cached) return callback(null, cached)

  return getPageSource(url)
    .then(decode)
    .then((res) => {
      const dom = new JSDOM(res)
      const tagReleases = {
        id: url,
        name: getTagName(tags),
        releaseUrls: getReleaseUrls(url, dom),
      }
      setToCache(cacheKey, tagReleases)
      return callback(null, tagReleases)
    })
    .catch((e) => callback(e))
}

const getPageDetails = (url, callback) => {
  const cacheKey = `pageDetails:${url}`
  const cached = getFromCache(cacheKey)
  if (cached) return callback(null, cached)

  return getPageSource(url)
    .then((res) => {
      const dom = new JSDOM(res)
      const pageTitle = getName(dom)
      const artistsLink = dom.window.document.querySelector('[href="/artists"]')
      const pageDetails = {
        id: getIdFromUrl(url),
        name: pageTitle,
        type: artistsLink === null ? 'artist' : 'label',
      }
      setToCache(cacheKey, pageDetails)
      return callback(null, pageDetails)
    })
    .catch((e) => {
      callback(e)
    })
}

const mapSearchResults = ({ auto: { results } }) =>
  results.map(({ is_label, item_url_path, item_url_root, id, name, img }) => ({
    type: is_label ? 'label' : 'artist',
    url: item_url_path || item_url_root,
    id,
    name,
    img,
  }))

const getSearchResults = (query, callback) => {
  return fetch('https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic', {
    method: 'POST',
    body: JSON.stringify({
      search_text: query,
      search_filter: 'b',
      fan_id: null,
      full_page: false,
    }),
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
    },
  })
    .then((res) => {
      if (!res) {
        console.error('Bandcamp search failed: No res')
        throw new Error('No results')
      }
      return res.json()
    })
    .then((res) => {
      callback(null, mapSearchResults(res))
    })
    .catch((e) => {
      logger.error(`Searching for ${query} failed`, { statusCode: e.statusCode })
      logger.silly(e)
      callback(e)
    })
}

const resetRequestCount = () => {
  requestCount = 0
}

const invalidateCache = (key) => {
  if (key) {
    cache.delete(key)
  } else {
    cache.clear()
  }
}

module.exports = {
  ...BPromise.promisifyAll({
    getRelease,
    getArtist: getPageInfo,
    getLabel: getPageInfo,
    getTagDetails,
    getTagReleases,
    getPageDetails,
    getSearchResults,
  }),
  static: {
    getTagsFromUrl,
    getTagName,
    isRateLimited,
    resetRequestCount,
    invalidateCache,
  },
}
