const logger = require('fomoplayer_shared').logger(__filename)
const request = require('request-promise')
const jsdom = require('jsdom')
const { JSDOM } = jsdom

const baseUrl = 'https://www.junodownload.com'
let suspendedUntil = null
let requestCount = 0

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
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MultiStorePlayer/1)' },
  }).catch((e) => {
    if ([429, 403].includes(e.statusCode)) {
      suspendedUntil = new Date(Date.now() + 10 * 60 * 1000)
      logger.error(`Rate limit reached after ${requestCount} requests. Status code: ${e.statusCode}. Requests are suspended until: ${suspendedUntil.toString()}`)
      const err = new Error(`Rate limit reached after ${requestCount} requests. Status code: ${e.statusCode}. Requests are suspended until: ${suspendedUntil.toString()}`)
      err.isRateLimit = true
      err.statusCode = e.statusCode
      err.requestCount = requestCount
      throw err
    }
    throw e
  })
}

const isRateLimited = () => suspendedUntil !== null && suspendedUntil >= Date.now()

const parseDuration = (durationStr) => {
  if (!durationStr) return null
  const iso = String(durationStr).replace(/^P/, '').replace(/^0H?/, '').replace(/M/, ':').replace(/S$/, '')
  const parts = iso.split(':')
  if (parts.length === 2) {
    const [m, s] = parts.map(Number)
    return (m * 60 + s) * 1000
  }
  return null
}

const parseDurationMinutes = (text) => {
  if (!text || typeof text !== 'string') return null
  const m = text.trim().match(/^(\d+):(\d+)$/)
  if (m) return (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000
  return null
}

const parseReleaseDate = (dateStr) => {
  if (!dateStr) return null
  const d = new Date(dateStr.replace(/(\d+)\s+(\w+),\s+(\d+)/, '$2 $1, $3'))
  return isNaN(d.getTime()) ? null : d.toISOString()
}

const getRelease = (pageSource, itemUrl) => {
  const dom = new JSDOM(pageSource)
  const doc = dom.window.document
  const productPage = doc.querySelector('#product-page-digi')
  if (!productPage) throw new Error('Product page structure not found')

  const artistEl = productPage.querySelector('.product-artist a')
  const titleEl = productPage.querySelector('.product-title a')
  const labelEl = productPage.querySelector('.product-label a')
  const dateEl = productPage.querySelector('[itemprop="datePublished"]')
  const genreEl = productPage.querySelector('.mb-2 a[href*="/"]')
  const mb2 = productPage.querySelector('.mb-2')
  let catalog_number = null
  if (mb2 && mb2.textContent) {
    const catMatch = mb2.textContent.match(/Cat:\s*([^\n]+?)(?:\n|Released|$)/)
    if (catMatch) catalog_number = catMatch[1].trim()
  }

  const releaseUrl = itemUrl.split('?')[0].replace(/\/$/, '')
  const urlMatch = releaseUrl.match(/\/products\/[^/]+\/(\d+)-(\d+)\/?$/)
  const titleId = urlMatch ? urlMatch[1] : null
  const productId = urlMatch ? urlMatch[2].padStart(2, '0') : null

  const artistName = artistEl ? artistEl.textContent.trim() : null
  const artistUrl = artistEl && artistEl.getAttribute('href') ? new URL(artistEl.getAttribute('href'), baseUrl).href : null
  const releaseTitle = titleEl ? titleEl.textContent.trim() : null
  const labelName = labelEl ? labelEl.textContent.trim() : null
  const labelUrl = labelEl && labelEl.getAttribute('href') ? new URL(labelEl.getAttribute('href'), baseUrl).href : null
  const released = dateEl ? parseReleaseDate(dateEl.textContent.trim()) : null
  const genreName = genreEl ? genreEl.textContent.trim() : null
  const genreUrl = genreEl && genreEl.getAttribute('href') ? new URL(genreEl.getAttribute('href'), baseUrl).href : null

  const trackRows = productPage.querySelectorAll('.product-tracklist-track[itemprop="track"]')
  const tracks = []
  trackRows.forEach((row, index) => {
    const nameEl = row.querySelector('[itemprop="name"]')
    const durationMeta = row.querySelector('meta[itemprop="duration"]')
    const trackLink = row.querySelector('.track-title a[itemprop="url"]')
    const playBtn = row.querySelector('.btn-play[href*=".mp3"]')
    const cols = row.querySelectorAll('.col-1.d-none.d-lg-block.text-center')
    let lengthMs = null
    if (durationMeta) {
      const content = durationMeta.getAttribute('content')
      lengthMs = parseDuration(content)
    }
    if (lengthMs == null && cols.length >= 1) lengthMs = parseDurationMinutes(cols[0].textContent)
    const bpm = cols.length >= 2 ? parseInt(cols[1].textContent.trim(), 10) : null
    const trackNumber = index + 1
    const trackId = titleId && productId ? `${titleId}-${productId}-${String(trackNumber).padStart(2, '0')}` : null
    const trackUrl = trackLink && trackLink.getAttribute('href') ? new URL(trackLink.getAttribute('href'), baseUrl).href : releaseUrl + (releaseUrl.includes('?') ? '&' : '?') + `track_number=${trackNumber}`
    const previewUrl = playBtn && playBtn.getAttribute('href') ? playBtn.getAttribute('href') : null

    tracks.push({
      id: trackId,
      store_track_id: trackId,
      title: nameEl ? nameEl.textContent.trim() : null,
      duration_ms: lengthMs,
      bpm,
      track_number: trackNumber,
      url: trackUrl,
      preview_url: previewUrl,
      release: {
        id: titleId && productId ? `${titleId}-${productId}` : null,
        title: releaseTitle,
        url: releaseUrl,
        catalog_number,
        released,
      },
      artists: artistName ? [{ name: artistName, role: 'author', id: null, url: artistUrl }] : [],
      label: labelName ? { id: null, name: labelName, url: labelUrl } : null,
      genres: genreName ? [{ name: genreName, id: null, url: genreUrl }] : [],
    })
  })

  return {
    url: releaseUrl,
    release: {
      id: titleId && productId ? `${titleId}-${productId}` : null,
      title: releaseTitle,
      url: releaseUrl,
      catalog_number,
      released,
      artist: artistName,
      artist_url: artistUrl,
      label: labelName,
      label_url: labelUrl,
      genre: genreName,
      genre_url: genreUrl,
    },
    tracks,
  }
}

const getReleaseFromUrl = (itemUrl) =>
  getPageSource(itemUrl)
    .then((html) => ({ ...getRelease(html, itemUrl), url: itemUrl }))
    .catch((e) => {
      logger.error(`Fetching release from ${itemUrl} failed`, { statusCode: e.statusCode })
      throw e
    })

const getReleaseUrls = (host, dom) => {
  const doc = dom.window.document
  const links = doc.querySelectorAll('a[href*="/products/"]')
  const seen = new Set()
  return Array.from(links)
    .map((a) => {
      const href = a.getAttribute('href')
      if (!href || href.includes('/cart/') || href.includes('track_number=')) return null
      try {
        return new URL(href, host).href.replace(/\?.*/, '').replace(/\/$/, '')
      } catch {
        return null
      }
    })
    .filter((url) => url && url.includes('/products/') && !seen.has(url) && (seen.add(url), true))
}

const getSlugFromUrl = (url) => {
  try {
    const path = new URL(url).pathname
    const artistMatch = path.match(/\/artists\/([^/]+)/)
    const labelMatch = path.match(/\/labels\/([^/]+)/)
    return (artistMatch && decodeURIComponent(artistMatch[1].replace(/\+/g, ' '))) ||
      (labelMatch && decodeURIComponent(labelMatch[1].replace(/\+/g, ' '))) || null
  } catch {
    return null
  }
}

const getPageInfo = (url) =>
  getPageSource(url).then((html) => {
    const dom = new JSDOM(html)
    const doc = dom.window.document
    const titleEl = doc.querySelector('title')
    const title = titleEl ? titleEl.textContent.replace(/\s*\|\s*Juno Download.*/, '').trim() : ''
    const releaseUrls = getReleaseUrls(url, dom)
    const id = getSlugFromUrl(url) || url
    return { id, name: title, releaseUrls }
  })

const searchApi = (query) =>
  getPageSource(`${baseUrl}/search/?q=${encodeURIComponent(query)}`)
    .then((html) => {
      const dom = new JSDOM(html)
      const doc = dom.window.document
      const productLinks = doc.querySelectorAll('a[href*="/products/"]')
      const artists = doc.querySelectorAll('a[href*="/artists/"]')
      const labels = doc.querySelectorAll('a[href*="/labels/"]')
      const results = []
      const seen = new Set()
      const add = (href, name, type) => {
        if (!href || !name || seen.has(href)) return
        seen.add(href)
        const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href
        const id = getSlugFromUrl(fullUrl) || fullUrl
        results.push({ type, id, name: name.trim(), url: fullUrl })
      }
      productLinks.forEach((a) => {
        const href = a.getAttribute('href')
        if (href && href.includes('/products/') && !href.includes('track_number=')) {
          const text = a.textContent.trim()
          if (text && text.length < 200) add(href, text, 'release')
        }
      })
      artists.forEach((a) => {
        const href = a.getAttribute('href')
        const text = a.textContent.trim()
        if (href && href.startsWith('/artists/') && text && text.length < 100) add(href, text, 'artist')
      })
      labels.forEach((a) => {
        const href = a.getAttribute('href')
        const text = a.textContent.trim()
        if (href && href.startsWith('/labels/') && text && text.length < 100) add(href, text, 'label')
      })
      return results.slice(0, 30)
    })
    .catch((e) => {
      logger.error(`Search for ${query} failed`, { statusCode: e.statusCode })
      throw e
    })

const resetRequestCount = () => { requestCount = 0 }

module.exports = {
  getReleaseFromUrl,
  getPageInfo,
  searchApi,
  static: {
    getRelease,
    getReleaseUrls,
    getPageSource,
    getSlugFromUrl,
    isRateLimited,
    resetRequestCount,
    baseUrl,
  },
}
