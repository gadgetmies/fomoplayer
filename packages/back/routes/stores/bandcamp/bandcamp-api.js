const BPromise = require('bluebird')
const R = require('ramda')
const logger = require('fomoplayer_shared').logger(__filename)
const { decode } = require('html-entities')
const jsdom = require('jsdom')
const { JSDOM } = jsdom
const { VM } = require('vm2')

const vm = new VM()
let suspendedUntil = null

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
    } else {
      return Promise.reject({
        message: `Rate limit reached. Requests are suspended until: ${suspendedUntil.toString()}`,
      })
    }
  }
  return request({
    method: 'GET',
    uri: url,
  }).catch((e) => {
    if ([429, 403].includes(e.statusCode)) {
      suspendedUntil = new Date(Date.now() + 10 /* minutes */ * 60 * 1000)
    } else {
      throw e
    }
  })
}

const getReleaseInfo = (pageSource) => extractJSON('[data-tralbum]', 'data-tralbum', pageSource)
const getRelease = (itemUrl, callback) => {
  return getPageSource(itemUrl)
    .then((res) => {
      callback(null, { ...getReleaseInfo(res), url: itemUrl })
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
  },
}
