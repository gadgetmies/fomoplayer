const BPromise = require('bluebird')
const R = require('ramda')
const logger = require('fomoplayer_shared').logger(__filename)
const { decode } = require('html-entities')
const jsdom = require('jsdom')
const { JSDOM } = jsdom
const vm = require('vm')

let suspendedUntil = null
let requestCount = 0

// Bandcamp sits behind Fastly, which answers requests that carry Node's default
// User-Agent (or a spoofed browser one) from datacenter addresses with a
// JavaScript "Client Challenge" page instead of the real page. Probing from
// Railway on 2026-11-01: a product/version token followed by a parenthetical
// comment gets the real page, a bare token or a browser string is challenged.
// Override with BANDCAMP_USER_AGENT if Bandcamp's rules change again.
const USER_AGENT = process.env.BANDCAMP_USER_AGENT || 'ReleaseTracker/1.0 (compatible; release feed)'
const withUserAgent = (headers = {}) => ({ 'User-Agent': USER_AGENT, ...headers })

const SUSPENSION_MS = 10 /* minutes */ * 60 * 1000

// Space requests out instead of firing a job's whole batch at once: bursts
// from one datacenter address are what Bandcamp's edge flags. Requests are
// serialised through a promise chain so concurrent callers also wait their turn.
const MIN_REQUEST_INTERVAL_MS = Number(process.env.BANDCAMP_MIN_REQUEST_INTERVAL_MS ?? 2000)
let lastRequestAt = 0
let requestQueue = Promise.resolve()
const waitForRequestSlot = () => {
  const slot = requestQueue.then(async () => {
    const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastRequestAt = Date.now()
  })
  requestQueue = slot.catch(() => {})
  return slot
}

// The challenge page comes back with HTTP 200, so it has to be recognised from
// its body: a "Client Challenge" title and assets served under /_fs-ch-<id>/.
const isChallengePage = (html) =>
  typeof html === 'string' && (/<title>\s*Client Challenge\s*<\/title>/i.test(html) || html.includes('/_fs-ch-'))

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
  await waitForRequestSlot()
  requestCount++
  const res = await fetch(url, { method: 'GET', ...options, headers: withUserAgent(options.headers) })
  if ([429, 403].includes(res.status)) {
    suspendedUntil = new Date(Date.now() + SUSPENSION_MS)
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
  const text = await res.text()
  if (isChallengePage(text)) {
    // Treat it like a rate limit: parsed as a page it would look like an
    // artist with no releases, and hammering on would only keep us flagged.
    suspendedUntil = new Date(Date.now() + SUSPENSION_MS)
    const message = `Bandcamp served a client challenge page for ${url} after ${requestCount} requests. Requests are suspended until: ${suspendedUntil.toString()}`
    logger.error(message)
    const error = new Error(message)
    error.isRateLimit = true
    error.isChallenge = true
    error.statusCode = res.status
    error.requestCount = requestCount
    throw error
  }
  return text
}

const isRateLimited = () => {
  return suspendedUntil !== null && suspendedUntil >= Date.now()
}

const getReleaseInfo = (dom) => extractJSON('[data-tralbum]', 'data-tralbum', dom)
const scrapeRelease = async (itemUrl) => {
  const dom = new JSDOM(await getPageSource(itemUrl))
  const pageName = getName(dom)
  const pageType = detectPageType(dom)
  warnOnNameSubdomainMismatch(itemUrl, pageType, pageName)
  return { ...getReleaseInfo(dom), url: itemUrl, pageType, pageName }
}

const getRelease = (itemUrl, callback) => {
  return resolveRelease(itemUrl)
    .then(async (resolved) => {
      if (!resolved) {
        logger.warn(`Release ${itemUrl} is not listed on its /music page, scraping the release page instead`)
        return scrapeRelease(itemUrl)
      }
      const { ids, pageType, pageName } = resolved
      warnOnNameSubdomainMismatch(itemUrl, pageType, pageName)
      return { ...tralbumToReleaseInfo(await getTralbumDetails(ids), itemUrl), pageType, pageName }
    })
    .then((releaseInfo) => callback(null, releaseInfo))
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

// Release pages are served as a Fastly client challenge to this backend (see
// isChallengePage), so release details come from Bandcamp's JSON endpoint
// instead. It needs the ids a /music page already lists for every release:
// each grid tile carries data-item-id="album-<id>" / "track-<id>" and
// data-band-id, and the tiles beyond the first page sit in the grid's
// data-client-items JSON. The index is keyed by the release URL without query
// or hash so label-page hrefs with ?label=…&tab=music resolve as well.
const TRALBUM_DETAILS_URL = 'https://bandcamp.com/api/mobile/24/tralbum_details'
const RELEASE_INDEX_TTL_MS = 10 /* minutes */ * 60 * 1000
const knownReleaseIds = new Map() // normalized release url -> { type, id, bandId }
const indexedPages = new Map() // origin -> { pageType, pageName, fetchedAt }

const normalizeReleaseUrl = (url, base) => {
  const u = new URL(url, base)
  return `${u.origin}${u.pathname.replace(/\/$/, '')}`
}

const parseReleaseIndex = (host, dom) => {
  const index = new Map()
  const doc = dom.window.document
  for (const tile of doc.querySelectorAll('#music-grid li[data-item-id][data-band-id], .featured-grid li[data-item-id][data-band-id]')) {
    const link = tile.querySelector('a[href]')
    const [, type, id] = (tile.getAttribute('data-item-id') || '').match(/^(album|track)-(\d+)$/) || []
    if (!link || !type) continue
    index.set(normalizeReleaseUrl(link.getAttribute('href'), host), { type, id, bandId: tile.getAttribute('data-band-id') })
  }
  const clientItems = doc.querySelector('#music-grid[data-client-items]')?.getAttribute('data-client-items')
  if (clientItems) {
    try {
      for (const { id, type, band_id, page_url } of JSON.parse(clientItems)) {
        if (id && ['album', 'track'].includes(type) && band_id && page_url) {
          index.set(normalizeReleaseUrl(page_url, host), { type, id: String(id), bandId: String(band_id) })
        }
      }
    } catch (e) {
      logger.warn('Could not parse Bandcamp data-client-items', { host, error: e.message })
    }
  }
  return index
}

const rememberPage = (url, dom) => {
  const origin = new URL(url).origin
  for (const [releaseUrl, ids] of parseReleaseIndex(origin, dom)) knownReleaseIds.set(releaseUrl, ids)
  const page = { pageType: detectPageType(dom), pageName: getName(dom), fetchedAt: Date.now() }
  indexedPages.set(origin, page)
  return page
}

const resetReleaseIndex = () => {
  knownReleaseIds.clear()
  indexedPages.clear()
}

// Find the ids of a release, fetching its subdomain's /music page when the
// release has not been seen on an indexed page recently.
const resolveRelease = async (itemUrl) => {
  const origin = new URL(itemUrl).origin
  const key = normalizeReleaseUrl(itemUrl, origin)
  const page = indexedPages.get(origin)
  if (!knownReleaseIds.has(key) && !(page && Date.now() - page.fetchedAt < RELEASE_INDEX_TTL_MS)) {
    rememberPage(origin, new JSDOM(await getPageSource(origin + '/music')))
  }
  const ids = knownReleaseIds.get(key)
  if (!ids) return null
  const { pageType, pageName } = indexedPages.get(origin) || { pageType: 'artist', pageName: null }
  return { ids, pageType, pageName }
}

// Bandcamp's pages format dates as "12 Sep 2025 00:00:00 GMT"; the JSON
// endpoint sends epoch seconds. Keep the page format so downstream stays equal.
const bandcampDate = (epochSeconds) =>
  epochSeconds ? new Date(epochSeconds * 1000).toUTCString().replace(/^\w+, /, '') : null

// Shape the JSON endpoint's response like the data-tralbum blob scraped from a
// release page, which is what bandcampReleasesTransform consumes.
const tralbumToReleaseInfo = (tralbum, itemUrl, now = Date.now()) => {
  const bandName = tralbum.band?.name || null
  const releaseDate = bandcampDate(tralbum.release_date)
  // The endpoint carries no publish date. A release already out was published
  // no later than its release date; a preorder is "published" from the moment
  // it is seen, which is what the page's publish_date meant.
  const publishDate = bandcampDate(Math.min(tralbum.release_date || Infinity, Math.floor(now / 1000)))
  return {
    id: tralbum.id,
    item_type: tralbum.type === 't' ? 'track' : 'album',
    url: itemUrl,
    artist: tralbum.tralbum_artist || bandName,
    art_id: tralbum.art_id,
    album_release_date: releaseDate,
    current: {
      id: tralbum.id,
      type: tralbum.type,
      title: tralbum.title,
      band_id: tralbum.band?.band_id,
      release_date: releaseDate,
      publish_date: publishDate,
    },
    trackinfo: (tralbum.tracks || []).map((track) => {
      // The page blob only names an artist on tracks that override the band's
      // name, and prefixes the title with it ("Artist - Title"), which the
      // releases transform parses for authors. The endpoint repeats the band
      // name on the other tracks and keeps the title bare, so rebuild the
      // page's convention here.
      const artist = track.band_name && track.band_name !== bandName ? track.band_name : null
      return {
        id: track.track_id,
        track_id: track.track_id,
        title: artist ? `${artist} - ${track.title}` : track.title,
        track_num: track.track_num,
        duration: track.duration,
        artist,
        file: track.streaming_url?.['mp3-128'] ? { 'mp3-128': track.streaming_url['mp3-128'] } : null,
        title_link: track.track_url || null,
      }
    }),
  }
}

const getTralbumDetails = async ({ bandId, type, id }) => {
  const text = await getPageSource(TRALBUM_DETAILS_URL, {
    method: 'POST',
    body: JSON.stringify({ band_id: Number(bandId), tralbum_type: type === 'track' ? 't' : 'a', tralbum_id: Number(id) }),
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  })
  const tralbum = JSON.parse(text)
  if (!tralbum || !Array.isArray(tralbum.tracks)) {
    throw new Error(`Unexpected tralbum_details response for ${type} ${id}: ${text.slice(0, 200)}`)
  }
  return tralbum
}

const getIdFromUrl = (url) => url.substring(0, url.indexOf('.'))

const getPageInfo = (url, callback) => {
  const id = getIdFromUrl(url)
  getPageSource(url + '/music')
    .then((res) => {
      const dom = new JSDOM(res)
      rememberPage(url, dom)
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
      if (/\/music\/?$/.test(new URL(url).pathname)) rememberPage(url, dom)
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
    headers: withUserAgent({ 'Content-Type': 'application/json; charset=UTF-8' }),
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

// Test support: clear a suspension left behind by an earlier request.
const resetRateLimit = () => {
  suspendedUntil = null
  requestCount = 0
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
    getTagUrl,
    getTagSlug,
    getDiscoverParams,
    getDiscoverReleaseUrls,
    isChallengePage,
    parseReleaseIndex,
    tralbumToReleaseInfo,
    resetReleaseIndex,
    isRateLimited,
    resetRequestCount,
    resetRateLimit,
    getRequestCount,
    userAgent: USER_AGENT,
    nameSubdomainSimilarity,
    getSubdomain,
    nameSubdomainSimilarityThreshold: NAME_SUBDOMAIN_SIMILARITY_THRESHOLD,
  },
}
