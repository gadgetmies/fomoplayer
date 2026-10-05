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

// A Bandcamp subdomain ("band" page) is either an artist or a label, but many
// labels run on a plain band account, so the obvious signals don't always
// catch them. We treat a page as a label when any of these hold:
//   - it has an `/artists` roster link (proper label accounts), or
//   - the page data carries is_label=true, or
//   - its discography lists releases by 2+ distinct artists (the per-tile
//     `artist-override` names) — the tell-tale of a label-run band account.
const isLabelAccount = (dom) => {
  const blob = dom.window.document.querySelector('#pagedata')?.getAttribute('data-blob')
  return blob ? /"is_label"\s*:\s*true/.test(blob) : false
}

const distinctOverrideArtistCount = (dom) =>
  new Set(
    Array.from(dom.window.document.querySelectorAll('#music-grid .artist-override'))
      .map((el) => el.textContent.trim().toLowerCase())
      .filter(Boolean),
  ).size

const detectPageType = (dom) => {
  if (dom.window.document.querySelector('[href="/artists"]') !== null) return 'label'
  if (isLabelAccount(dom)) return 'label'
  if (distinctOverrideArtistCount(dom) >= 2) return 'label'
  return 'artist'
}

// Heuristic sanity check: a Bandcamp page's artist/label name usually
// resembles its subdomain ("Ivy Lab" -> ivylab, "Fokuz Recordings" ->
// fokuzrecordings). A large divergence is a signal that the page may have
// been mis-typed (a label parsed as an artist or vice versa) and that
// releases fetched from it risk being attributed to the wrong entity, so we
// surface it in the log rather than failing.
const NAME_SUBDOMAIN_SIMILARITY_THRESHOLD = 0.5

const normalizeName = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const getSubdomain = (url) => {
  try {
    return new URL(url).hostname.split('.')[0]
  } catch (_) {
    return ''
  }
}

const levenshtein = (a, b) => {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  let curr = new Array(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

// 1 = identical (or one contains the other), 0 = completely different.
const nameSubdomainSimilarity = (name, subdomain) => {
  const a = normalizeName(name)
  const b = normalizeName(subdomain)
  if (!a || !b) return 1 // not enough to compare -> don't warn
  if (a === b || a.includes(b) || b.includes(a)) return 1
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length)
}

const warnOnNameSubdomainMismatch = (url, pageType, pageName) => {
  const subdomain = getSubdomain(url)
  const similarity = nameSubdomainSimilarity(pageName, subdomain)
  if (similarity < NAME_SUBDOMAIN_SIMILARITY_THRESHOLD) {
    logger.warn(`Bandcamp ${pageType} name differs significantly from its subdomain; releases may be misattributed`, {
      url,
      pageType,
      pageName,
      subdomain,
      similarity: Number(similarity.toFixed(2)),
    })
  }
}

const getPageSource = async (url, options = {}) => {
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
  const res = await fetch(url, { method: 'GET', ...options })
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
      const pageName = getName(dom)
      const pageType = detectPageType(dom)
      warnOnNameSubdomainMismatch(itemUrl, pageType, pageName)
      callback(null, {
        ...getReleaseInfo(dom),
        url: itemUrl,
        pageType,
        pageName,
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
        type: detectPageType(dom),
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

// The discover page is rendered client-side, so its HTML no longer carries any
// release links. Query the JSON endpoint the page itself calls instead.
const DISCOVER_API_URL = 'https://bandcamp.com/api/discover/1/discover_web'
const DISCOVER_RESULT_COUNT = 60
// Ids of the discover page's format filter, keyed by the slug used in its URL.
const discoverCategoryIds = { all: 0, digital: 1, vinyl: 2, cd: 3, cassette: 4, tshirt: 5 }

const getDiscoverParams = (tags) => ({
  category_id: discoverCategoryIds[tags.format] ?? 0,
  tag_norm_names: [tags.genre, tags.subgenre]
    .filter((part) => part && part !== 'all')
    .flatMap((part) => part.split('+')),
  geoname_id: 0,
  slice: 'top',
  time_facet_id: null,
  cursor: '*',
  size: DISCOVER_RESULT_COUNT,
  include_result_types: ['a', 's'],
})

const getDiscoverReleaseUrls = ({ results }) =>
  R.uniq(
    results.map(({ item_url }) => {
      const url = new URL(item_url)
      url.searchParams.delete('from')
      return url.toString()
    }),
  )

const getTagReleases = (tags, callback) => {
  const parsedTags = tags instanceof String ? JSON.parse(tags) : tags
  return getPageSource(DISCOVER_API_URL, {
    method: 'POST',
    body: JSON.stringify(getDiscoverParams(parsedTags)),
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  })
    .then((res) => {
      return callback(null, {
        id: getTagUrl(parsedTags),
        name: getTagName(parsedTags),
        releaseUrls: getDiscoverReleaseUrls(JSON.parse(res)),
      })
    })
    .catch((e) => callback(e))
}

const getPageDetails = (url, callback) => {
  return getPageSource(url)
    .then((res) => {
      const dom = new JSDOM(res)
      return callback(null, {
        id: getIdFromUrl(url),
        name: getName(dom),
        type: detectPageType(dom),
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
    getDiscoverParams,
    getDiscoverReleaseUrls,
    isRateLimited,
    resetRequestCount,
    getRequestCount,
    nameSubdomainSimilarity,
    getSubdomain,
    nameSubdomainSimilarityThreshold: NAME_SUBDOMAIN_SIMILARITY_THRESHOLD,
  },
}
