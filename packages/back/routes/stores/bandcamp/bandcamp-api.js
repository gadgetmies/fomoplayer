const BPromise = require('bluebird')
const R = require('ramda')
const logger = require('fomoplayer_shared').logger(__filename)
const { decode } = require('html-entities')
const jsdom = require('jsdom')
const { JSDOM } = jsdom
const vm = require('vm')

let suspendedUntil = null
let requestCount = 0

const scrapeJSON = R.curry((pattern, string) => {
  const match = string.match(new RegExp(pattern), 's')
  if (match === null) {
    throw new Error('No match for pattern')
  }

  return vm.runInNewContext(match[1], {})
})

const extractJSON = R.curry((selector, attribute = undefined, dom) => {
  const element = dom.window.document.querySelector(selector)
  const text = attribute ? element.getAttribute(attribute) : element.textContent
  return JSON.parse(text)
})

// A Bandcamp subdomain ("band" page) is either an artist or a label. Label
// pages expose an `/artists` link (the roster); artist pages do not. The
// release URL of anything published through a label points at the *label's*
// subdomain, so this is what lets the transform avoid treating the label as
// the artist. Mirrors the heuristic in `getPageDetails`.
const getPageType = (dom) => (dom.window.document.querySelector('[href="/artists"]') === null ? 'artist' : 'label')

const getPageSource = async (url) => {
  if (suspendedUntil) {
    if (suspendedUntil < Date.now()) {
      suspendedUntil = null
      requestCount = 0
    } else {
      const error = new Error(`Rate limit reached. Requests are suspended until: ${suspendedUntil.toString()}`)
      error.isRateLimit = true
      throw error
    }
  }
  requestCount++
  const res = await fetch(url, { method: 'GET' })
  if ([429, 403].includes(res.status)) {
    suspendedUntil = new Date(Date.now() + 10 /* minutes */ * 60 * 1000)
    logger.error(
      `Rate limit reached after ${requestCount} requests. Status code: ${res.status}. Requests are suspended until: ${suspendedUntil.toString()}`,
    )
    const error = new Error(
      `Rate limit reached after ${requestCount} requests. Status code: ${res.status}. Requests are suspended until: ${suspendedUntil.toString()}`,
    )
    error.isRateLimit = true
    error.statusCode = res.status
    error.requestCount = requestCount
    throw error
  }
  if (!res.ok) {
    const error = new Error(`Request failed with status ${res.status}`)
    error.statusCode = res.status
    throw error
  }
  return res.text()
}

const isRateLimited = () => {
  return suspendedUntil !== null && suspendedUntil >= Date.now()
}

const getReleaseInfo = (dom) => extractJSON('[data-tralbum]', 'data-tralbum', dom)
const getRelease = (itemUrl, callback) => {
  return getPageSource(itemUrl)
    .then((res) => {
      const dom = new JSDOM(res)
      callback(null, {
        ...getReleaseInfo(dom),
        url: itemUrl,
        pageType: getPageType(dom),
        pageName: getName(dom),
      })
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
  const id = getIdFromUrl(url)
  getPageSource(url + '/music')
    .then((res) => {
      const dom = new JSDOM(res)
      return callback(null, {
        id,
        name: getName(dom),
        releaseUrls: getReleaseUrls(url, dom),
      })
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

// A Bandcamp tag playlist is the discover page for one or more tags, e.g.
// https://bandcamp.com/discover/drum-bass or .../bass-music+drum-bass+dubstep.
// Slugify a free-text query into such a tag term so any search can offer the
// matching "Music tagged with ..." playlist.
const getTagSlug = (query) =>
  (query || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, '-')
    .replace(/^-+|-+$/g, '')

const getTagName = (tags) => {
  const term = [tags.genre, tags.subgenre].filter((part) => part && part !== 'all').join('+')
  return `Music tagged with ${term || 'all music'}${tags.format ? ` (${tags.format})` : ''}`
}

const getTagDetails = (tags, callback) => {
  callback(null, {
    id: getTagUrl(tags),
    name: getTagName(tags),
  })
}

const getTagReleases = (tags, callback) => {
  const url = getTagUrl(tags instanceof String ? JSON.parse(tags) : tags)
  return getPageSource(url)
    .then(decode)
    .then((res) => {
      const dom = new JSDOM(res)
      return callback(null, {
        id: url,
        name: getTagName(tags),
        releaseUrls: getReleaseUrls(url, dom),
      })
    })
    .catch((e) => callback(e))
}

const getPageDetails = (url, callback) => {
  return getPageSource(url)
    .then((res) => {
      const dom = new JSDOM(res)
      const pageTitle = getName(dom)
      const artistsLink = dom.window.document.querySelector('[href="/artists"]')
      return callback(null, {
        id: getIdFromUrl,
        name: pageTitle,
        type: artistsLink === null ? 'artist' : 'label',
      })
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
    .then((res) => res.json())
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

const getRequestCount = () => requestCount

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
    getTagUrl,
    getTagSlug,
    isRateLimited,
    resetRequestCount,
    getRequestCount,
  },
}
