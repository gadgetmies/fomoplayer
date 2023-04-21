const BPromise = require('bluebird')
const R = require('ramda')
const logger = require('../../../logger')(__filename)
const { decode } = require('html-entities')
const jsdom = require('jsdom')
const { JSDOM } = jsdom
const { VM } = require('vm2')

const vm = new VM()

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

const getPageSource = url =>
  request({
    method: 'GET',
    uri: url
  })

const getReleaseInfo = pageSource => extractJSON('[data-tralbum]', 'data-tralbum', pageSource)
const getRelease = (itemUrl, callback) => {
  return getPageSource(itemUrl)
    .then(res => {
      callback(null, { ...getReleaseInfo(res), url: itemUrl })
    })
    .catch(e => {
      logger.error(`Fetching release from ${itemUrl} failed`, {statusCode: e.statusCode})
      logger.silly(e)
      callback(e)
    })
}

const getPageTitle = pageSource => {
  const startText = '<title>'
  const start = pageSource.indexOf(startText) + startText.length
  return pageSource.substring(start, pageSource.indexOf('</title>', start))
}

const getName = dom => {
  const siteNameElement = dom.window.document.querySelector('[property="og:site_name"]')
  const nameFromTitle = dom.window.document.title && dom.window.document.title.split(' | ')[1]
  return (siteNameElement !== null && siteNameElement.getAttribute('content')) || nameFromTitle
}

const getReleaseUrls = (host, dom) =>
  Array.from(dom.window.document.querySelectorAll('#music-grid a')).map(i =>
    new URL(i.getAttribute('href'), host).toString()
  )

const getIdFromUrl = url => url.substring(0, url.indexOf('.'))

const getPageInfo = (url, callback) => {
  const id = getIdFromUrl(url)
  getPageSource(url + '/music').then(res => {
    const dom = new JSDOM(res)
    return callback(null, {
      id,
      name: getName(dom),
      releaseUrls: getReleaseUrls(url, dom)
    })
  }).catch(e => {
    callback(e)
  })
}

const getTagUrl = function(tag) {
  return `https://bandcamp.com/tag/${tag}`
}

const getTag = (tag, callback) => {
  const url = getTagUrl(tag)
  return getPageSource(url).then(res => {
    const pageTitle = getPageTitle(res)
    const tagTitle = decode(pageTitle.substring(0, pageTitle.indexOf(' Music &amp; Artists | Bandcamp')))

    return callback(null, {
      id: tag,
      name: tagTitle
    })
  }).catch(e => {
    callback(e)
  })
}

const getTagReleases = (tag, callback) => {
  const url = getTagUrl(tag)
  return getPageSource(url)
    .then(decode)
    .then(res => {
      const pageData = scrapeJSON('<div id="pagedata" data-blob="(.*})">', res)
      const { initial_settings: initialSettings, results } = pageData.hub.tabs[1].dig_deeper
      callback(null, [...pageData.hub.tabs[0].collections, results[initialSettings]])
    })
    .catch(e => callback(e))
}

const getPageDetails = (url, callback) => {
  return getPageSource(url).then(res => {
    const dom = new JSDOM(res)
    const pageTitle = getName(dom)
    const artistsLink = dom.window.document.querySelector('[href="/artists"]')
    return callback(null, {
      id: getIdFromUrl,
      name: pageTitle,
      type: artistsLink === null ? 'artist' : 'label'
    })
  }).catch(e => {
    callback(e)
  })
}

const mapSearchResults = ({ auto: { results } }) =>
  results.map(({ is_label, url, id, name, img }) => ({ type: is_label ? 'label' : 'artist', url, id, name, img }))

const getSearchResults = (query, callback) => {
  return request({
    method: 'POST',
    uri: 'https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_fuzzy',
    body: {
      search_text: query,
      search_filter: 'b',
      match_test: false
    },
    json: true
  })
    .then(res => {
      callback(null, mapSearchResults(res))
    })
    .catch(e => {
      logger.error(`Searching for ${query} failed`, {statusCode: e.statusCode})
      logger.silly(e)
      callback(e)
    })
}

module.exports = BPromise.promisifyAll({
  getRelease,
  getArtist: getPageInfo,
  getLabel: getPageInfo,
  getTag,
  getTagReleases,
  getPageDetails,
  getSearchResults
})
