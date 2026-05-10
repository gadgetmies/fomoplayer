'use strict'

const FEED_SHAPE_MESSAGE =
  'Bandcamp feed endpoint returned an unexpected shape — try re-logging in to bandcamp.com or file a bug.'

class FeedShapeError extends Error {
  constructor(message = FEED_SHAPE_MESSAGE) {
    super(message)
    this.name = 'FeedShapeError'
  }
}

const isJsonContentType = (contentType) =>
  typeof contentType === 'string' && /^application\/json/i.test(contentType.trim())

const assertJsonContentType = (contentType) => {
  if (!isJsonContentType(contentType)) {
    throw new FeedShapeError()
  }
}

const parseFeedPage = (feed) => {
  const entries = feed && feed.stories && feed.stories.entries
  if (!Array.isArray(entries)) {
    throw new FeedShapeError()
  }
  const releases = entries.filter(({ story_type: storyType }) => storyType === 'nr')
  const nextOlderThan = feed.stories.oldest_story_date
  return { releases, nextOlderThan }
}

const HTML_ENTITY_MAP = {
  quot: '"',
  '#34': '"',
  amp: '&',
  '#39': "'",
  apos: "'",
  lt: '<',
  gt: '>',
}

const decodeHtmlEntities = (s) =>
  s.replace(/&(quot|amp|#39|apos|lt|gt|#34);/g, (_, entity) => HTML_ENTITY_MAP[entity] || `&${entity};`)

const PANEL_SENTINEL = 'id="new-releases-vm"'
const NEW_RELEASE_LI_RE = /<li\b[^>]*\bclass="[^"]*\bnew-release\b[^"]*"[^>]*>/gi
const DATA_ITEM_JSON_RE = /\bdata-item-json="([^"]*)"/i

const parseFollowedArtistsPanel = (html) => {
  if (typeof html !== 'string' || !html.includes(PANEL_SENTINEL)) {
    throw new FeedShapeError()
  }
  const items = []
  let match
  NEW_RELEASE_LI_RE.lastIndex = 0
  while ((match = NEW_RELEASE_LI_RE.exec(html)) !== null) {
    const dataMatch = DATA_ITEM_JSON_RE.exec(match[0])
    if (!dataMatch) continue
    const decoded = decodeHtmlEntities(dataMatch[1])
    try {
      items.push(JSON.parse(decoded))
    } catch (e) {
      console.warn(
        '[bandcamp:scrape-feed] panel parser dropped item:',
        e && e.message,
        'raw=', decoded.slice(0, 200),
      )
    }
  }
  return items
}

const PAGEDATA_DATA_BLOB_RE = /<div\s+id="pagedata"[^>]*\bdata-blob="([^"]+)"/i

// Bandcamp profile URLs have the shape https://bandcamp.com/<username>(/...)?.
// Reject paths that look like reserved subpages (login, discover, api/...) so
// we don't accidentally extract those as usernames when a fetch is redirected
// somewhere unexpected. Real usernames are kebab-case and never contain dots.
const RESERVED_PATHS = new Set([
  'login',
  'logout',
  'signup',
  'discover',
  'feed',
  'wishlist',
  'api',
  'help',
  'tag',
  'tags',
  'search',
  'embed',
  'pro',
  'subscribe',
])

const usernameFromBandcampUrl = (url) => {
  if (typeof url !== 'string') return null
  const match = /^https?:\/\/(?:www\.)?bandcamp\.com\/([^/?#]+)/i.exec(url.trim())
  if (!match) return null
  const candidate = match[1]
  if (!candidate || candidate.includes('.') || RESERVED_PATHS.has(candidate.toLowerCase())) return null
  return candidate
}

const parsePagedataUsername = (html) => {
  if (typeof html !== 'string') return null
  const match = PAGEDATA_DATA_BLOB_RE.exec(html)
  if (!match) return null
  let blob
  try {
    blob = JSON.parse(decodeHtmlEntities(match[1]))
  } catch (e) {
    return null
  }
  const fan = blob && blob.identities && blob.identities.fan
  if (!fan) return null
  if (typeof fan.username === 'string' && fan.username.length > 0) return fan.username
  return usernameFromBandcampUrl(fan.url)
}

const isBandcampHostedUrl = (url) => {
  if (typeof url !== 'string' || url.length === 0) return false
  const match = /^https?:\/\/([^/?#]+)/i.exec(url.trim())
  if (!match) return false
  const host = match[1].toLowerCase()
  return host === 'bandcamp.com' || host === 'www.bandcamp.com' || host.endsWith('.bandcamp.com')
}

// Custom-domain releases (e.g. shallnotfade.co.uk) cannot be scraped by the
// per-release tab flow because executeScript requires the host in
// manifest host_permissions, which are deliberately scoped to *.bandcamp.com.
// Returns { kept, dropped } so callers can log how much coverage they lose.
const partitionBandcampHosted = (releases) => {
  const kept = []
  const dropped = []
  if (!Array.isArray(releases)) return { kept, dropped }
  for (const release of releases) {
    const url = release && release.item_url
    if (!url || isBandcampHostedUrl(url)) {
      kept.push(release)
    } else {
      dropped.push(release)
    }
  }
  return { kept, dropped }
}

const releaseKey = (release) => {
  if (!release || typeof release !== 'object') return null
  if (release.item_url) return `url:${release.item_url}`
  if (release.item_id != null) return `id:${release.item_id}`
  return null
}

const mergeReleases = (...lists) => {
  const seenUrls = new Set()
  const seenIds = new Set()
  const out = []
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const release of list) {
      if (!release || typeof release !== 'object') {
        out.push(release)
        continue
      }
      const url = release.item_url || null
      const id = release.item_id != null ? String(release.item_id) : null
      if (url == null && id == null) {
        out.push(release)
        continue
      }
      if ((url && seenUrls.has(url)) || (id && seenIds.has(id))) continue
      if (url) seenUrls.add(url)
      if (id) seenIds.add(id)
      out.push(release)
    }
  }
  return out
}

module.exports = {
  FEED_SHAPE_MESSAGE,
  FeedShapeError,
  isJsonContentType,
  assertJsonContentType,
  parseFeedPage,
  parseFollowedArtistsPanel,
  parsePagedataUsername,
  usernameFromBandcampUrl,
  isBandcampHostedUrl,
  partitionBandcampHosted,
  mergeReleases,
  releaseKey,
}
