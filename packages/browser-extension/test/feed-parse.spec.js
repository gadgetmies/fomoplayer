'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
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
} = require('../src/js/content/bandcamp/feed-parse')

describe('parseFeedPage', () => {
  it('returns filtered nr releases and the next olderThan on a happy-path response', () => {
    const feed = {
      stories: {
        oldest_story_date: 1700000000,
        entries: [
          { story_type: 'nr', id: 'a' },
          { story_type: 'fav', id: 'b' },
          { story_type: 'nr', id: 'c' },
        ],
      },
    }
    const { releases, nextOlderThan } = parseFeedPage(feed)
    assert.deepStrictEqual(releases.map((r) => r.id), ['a', 'c'])
    assert.strictEqual(nextOlderThan, 1700000000)
  })

  it('throws FeedShapeError (not TypeError) when feed.stories is missing', () => {
    assert.throws(
      () => parseFeedPage({}),
      (err) => err instanceof FeedShapeError && err.message === FEED_SHAPE_MESSAGE,
    )
  })

  it('throws FeedShapeError when feed.stories is null', () => {
    assert.throws(() => parseFeedPage({ stories: null }), FeedShapeError)
  })

  it('throws FeedShapeError when feed.stories.entries is not an array', () => {
    assert.throws(() => parseFeedPage({ stories: { entries: null } }), FeedShapeError)
    assert.throws(() => parseFeedPage({ stories: { entries: 'oops' } }), FeedShapeError)
    assert.throws(() => parseFeedPage({ stories: { entries: { 0: 'x' } } }), FeedShapeError)
  })

  it('does not raise TypeError before the typed error', () => {
    try {
      parseFeedPage(undefined)
      assert.fail('expected throw')
    } catch (err) {
      assert.strictEqual(err.name, 'FeedShapeError')
    }
  })
})

describe('isJsonContentType / assertJsonContentType', () => {
  it('accepts plain application/json', () => {
    assert.strictEqual(isJsonContentType('application/json'), true)
  })

  it('accepts application/json with charset parameter and casing variants', () => {
    assert.strictEqual(isJsonContentType('application/json; charset=utf-8'), true)
    assert.strictEqual(isJsonContentType('Application/JSON;charset=UTF-8'), true)
    assert.strictEqual(isJsonContentType('  application/json  '), true)
  })

  it('rejects HTML and missing content-types', () => {
    assert.strictEqual(isJsonContentType('text/html; charset=utf-8'), false)
    assert.strictEqual(isJsonContentType(''), false)
    assert.strictEqual(isJsonContentType(null), false)
    assert.strictEqual(isJsonContentType(undefined), false)
  })

  it('throws FeedShapeError from assertJsonContentType when the type is wrong', () => {
    assert.throws(() => assertJsonContentType('text/html; charset=utf-8'), FeedShapeError)
    assert.throws(() => assertJsonContentType(null), FeedShapeError)
  })

  it('does not throw from assertJsonContentType when the type is JSON', () => {
    assert.doesNotThrow(() => assertJsonContentType('application/json'))
    assert.doesNotThrow(() => assertJsonContentType('application/json; charset=utf-8'))
  })
})

const encodeAttr = (obj) =>
  JSON.stringify(obj)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const renderItem = (item, { hidden = false } = {}) =>
  `<li class="new-release collection-item-container" data-itemid="${item.item_id}" data-item-json="${encodeAttr(
    item,
  )}"${hidden ? ' style="display: none"' : ''}>inner</li>`

const wrapPanel = (innerHtml) =>
  `<html><body><div id="new-releases-vm" class="new-releases ">
    <h2>New Releases from artists you follow</h2>
    <ol class="collection-grid">${innerHtml}</ol>
  </div></body></html>`

describe('parseFollowedArtistsPanel', () => {
  it('returns normalised release objects on a happy-path fixture with two items', () => {
    const a = { item_id: 1, item_url: 'https://liquicity.bandcamp.com/album/magic', item_title: 'Magic' }
    const b = { item_id: 2, item_url: 'https://other.bandcamp.com/album/two', item_title: 'Two' }
    const html = wrapPanel(`${renderItem(a)}${renderItem(b)}`)
    const items = parseFollowedArtistsPanel(html)
    assert.strictEqual(items.length, 2)
    assert.deepStrictEqual(items.map((i) => i.item_url), [a.item_url, b.item_url])
  })

  it('returns [] when the panel container is present but contains no new-release items', () => {
    const html = wrapPanel('')
    assert.deepStrictEqual(parseFollowedArtistsPanel(html), [])
  })

  it('throws FeedShapeError when id="new-releases-vm" is absent (login redirect)', () => {
    const html = '<html><body><div id="login-form">please log in</div></body></html>'
    assert.throws(() => parseFollowedArtistsPanel(html), FeedShapeError)
  })

  it('throws FeedShapeError on non-string input without raising TypeError', () => {
    try {
      parseFollowedArtistsPanel(undefined)
      assert.fail('expected throw')
    } catch (err) {
      assert.strictEqual(err.name, 'FeedShapeError')
    }
  })

  it('ingests CSS-hidden items past the "show more" cutoff', () => {
    const visible = { item_id: 10, item_url: 'https://a.bandcamp.com/album/v', item_title: 'visible' }
    const hidden1 = { item_id: 11, item_url: 'https://b.bandcamp.com/album/h1', item_title: 'hidden 1' }
    const hidden2 = { item_id: 12, item_url: 'https://c.bandcamp.com/album/h2', item_title: 'hidden 2' }
    const html = wrapPanel(
      `${renderItem(visible)}${renderItem(hidden1, { hidden: true })}${renderItem(hidden2, { hidden: true })}`,
    )
    const items = parseFollowedArtistsPanel(html)
    assert.strictEqual(items.length, 3)
    assert.deepStrictEqual(items.map((i) => i.item_url), [visible.item_url, hidden1.item_url, hidden2.item_url])
  })

  it('drops individual items whose data-item-json fails to parse but keeps the rest', () => {
    const good = { item_id: 1, item_url: 'https://x.bandcamp.com/album/y' }
    const broken = '<li class="new-release" data-item-json="{not json}">x</li>'
    const html = wrapPanel(`${renderItem(good)}${broken}`)
    const items = parseFollowedArtistsPanel(html)
    assert.strictEqual(items.length, 1)
    assert.strictEqual(items[0].item_url, good.item_url)
  })

  it('does not match li elements that lack the new-release class even if they carry data-item-json', () => {
    const html = `<html><body><div id="new-releases-vm">
      <ol><li class="some-other-class" data-item-json="${encodeAttr({ item_id: 99, item_url: 'https://z.bandcamp.com/x' })}">x</li></ol>
    </div></body></html>`
    assert.deepStrictEqual(parseFollowedArtistsPanel(html), [])
  })
})

const renderPagedata = (blob) => `<div id="pagedata" data-blob="${encodeAttr(blob)}"></div>`

describe('parsePagedataUsername', () => {
  it('returns the username from a happy-path pagedata blob', () => {
    const html = renderPagedata({ identities: { fan: { id: 63171, username: 'elysion' } } })
    assert.strictEqual(parsePagedataUsername(html), 'elysion')
  })

  it('returns null when pagedata is absent', () => {
    assert.strictEqual(parsePagedataUsername('<html><body>no pagedata here</body></html>'), null)
  })

  it('returns null when pagedata is malformed JSON (does not throw)', () => {
    const html = '<div id="pagedata" data-blob="{not json">x</div>'
    assert.strictEqual(parsePagedataUsername(html), null)
  })

  it('returns null when identities.fan.username is absent', () => {
    const html = renderPagedata({ identities: { fan: { id: 63171 } } })
    assert.strictEqual(parsePagedataUsername(html), null)
  })

  it('returns null when identities.fan.username is empty', () => {
    const html = renderPagedata({ identities: { fan: { username: '' } } })
    assert.strictEqual(parsePagedataUsername(html), null)
  })

  it('falls back to deriving the username from identities.fan.url', () => {
    const html = renderPagedata({ identities: { fan: { url: 'https://bandcamp.com/elysion' } } })
    assert.strictEqual(parsePagedataUsername(html), 'elysion')
  })

  it('rejects identities.fan.url that does not point at a username path', () => {
    const html = renderPagedata({ identities: { fan: { url: 'https://bandcamp.com/' } } })
    assert.strictEqual(parsePagedataUsername(html), null)
    const html2 = renderPagedata({ identities: { fan: { url: 'https://example.com/elysion' } } })
    assert.strictEqual(parsePagedataUsername(html2), null)
  })

  it('returns null on non-string input without throwing', () => {
    assert.strictEqual(parsePagedataUsername(null), null)
    assert.strictEqual(parsePagedataUsername(undefined), null)
  })

  it('extracts a username from the captured logged-in feed page when present', () => {
    const fixturePath = path.resolve(__dirname, '../../..', 'temp', 'feed.html')
    if (!fs.existsSync(fixturePath)) return // fixture is local-only; skip when absent
    const html = fs.readFileSync(fixturePath, 'utf8')
    const username = parsePagedataUsername(html)
    assert.ok(typeof username === 'string' && username.length > 0, `expected a username, got ${username}`)
  })

  it('finds the followed-artists panel sentinel in the captured logged-in feed page', () => {
    const fixturePath = path.resolve(__dirname, '../../..', 'temp', 'feed.html')
    if (!fs.existsSync(fixturePath)) return
    const html = fs.readFileSync(fixturePath, 'utf8')
    const items = parseFollowedArtistsPanel(html)
    assert.ok(items.length > 0, `expected at least one panel item, got ${items.length}`)
    for (const item of items) {
      assert.ok(item && (item.item_url || item.item_id), 'panel item must have item_url or item_id')
    }
  })
})

describe('usernameFromBandcampUrl', () => {
  it('extracts the username segment from a profile URL', () => {
    assert.strictEqual(usernameFromBandcampUrl('https://bandcamp.com/elysion'), 'elysion')
    assert.strictEqual(usernameFromBandcampUrl('https://bandcamp.com/elysion/feed'), 'elysion')
    assert.strictEqual(usernameFromBandcampUrl('https://www.bandcamp.com/elysion'), 'elysion')
    assert.strictEqual(usernameFromBandcampUrl('https://bandcamp.com/elysion?from=menubar'), 'elysion')
  })

  it('rejects reserved paths that are not usernames', () => {
    assert.strictEqual(usernameFromBandcampUrl('https://bandcamp.com/login'), null)
    assert.strictEqual(usernameFromBandcampUrl('https://bandcamp.com/discover'), null)
    assert.strictEqual(usernameFromBandcampUrl('https://bandcamp.com/api/foo'), null)
  })

  it('rejects subdomain hosts and non-Bandcamp hosts', () => {
    assert.strictEqual(usernameFromBandcampUrl('https://liquicity.bandcamp.com/album/magic'), null)
    assert.strictEqual(usernameFromBandcampUrl('https://example.com/elysion'), null)
  })

  it('rejects bare-host URLs and bad input', () => {
    assert.strictEqual(usernameFromBandcampUrl('https://bandcamp.com/'), null)
    assert.strictEqual(usernameFromBandcampUrl('https://bandcamp.com'), null)
    assert.strictEqual(usernameFromBandcampUrl(null), null)
    assert.strictEqual(usernameFromBandcampUrl(undefined), null)
  })
})

describe('isBandcampHostedUrl / partitionBandcampHosted', () => {
  it('accepts bandcamp.com hosts and subdomains', () => {
    assert.strictEqual(isBandcampHostedUrl('https://bandcamp.com/elysion/feed'), true)
    assert.strictEqual(isBandcampHostedUrl('https://www.bandcamp.com/'), true)
    assert.strictEqual(isBandcampHostedUrl('https://liquicity.bandcamp.com/album/magic'), true)
  })

  it('rejects custom artist domains and non-Bandcamp hosts', () => {
    assert.strictEqual(isBandcampHostedUrl('https://shallnotfade.co.uk/album/back-2-earth'), false)
    assert.strictEqual(isBandcampHostedUrl('https://example.com/'), false)
    assert.strictEqual(isBandcampHostedUrl(''), false)
    assert.strictEqual(isBandcampHostedUrl(null), false)
  })

  it('partitions a release list into kept (bandcamp.com) and dropped (custom domains)', () => {
    const releases = [
      { item_id: 1, item_url: 'https://liquicity.bandcamp.com/album/magic' },
      { item_id: 2, item_url: 'https://shallnotfade.co.uk/album/back-2-earth' },
      { item_id: 3, item_url: 'https://bandcamp.com/elysion' },
      { item_id: 4 }, // no url — kept defensively
    ]
    const { kept, dropped } = partitionBandcampHosted(releases)
    assert.deepStrictEqual(kept.map((r) => r.item_id), [1, 3, 4])
    assert.deepStrictEqual(dropped.map((r) => r.item_id), [2])
  })

  it('returns empty arrays for non-array input', () => {
    assert.deepStrictEqual(partitionBandcampHosted(null), { kept: [], dropped: [] })
    assert.deepStrictEqual(partitionBandcampHosted(undefined), { kept: [], dropped: [] })
  })
})

describe('mergeReleases', () => {
  it('dedupes on item_url across two sources, panel-first wins', () => {
    const panel = [
      { item_id: 1, item_url: 'https://a/album/x', source: 'panel' },
      { item_id: 2, item_url: 'https://b/album/y', source: 'panel' },
    ]
    const fanDash = [
      { item_id: 1, item_url: 'https://a/album/x', source: 'fanDash' },
      { item_id: 3, item_url: 'https://c/album/z', source: 'fanDash' },
    ]
    const merged = mergeReleases(panel, fanDash)
    assert.strictEqual(merged.length, 3)
    assert.deepStrictEqual(merged.map((r) => r.item_url), [
      'https://a/album/x',
      'https://b/album/y',
      'https://c/album/z',
    ])
    assert.strictEqual(merged.find((r) => r.item_url === 'https://a/album/x').source, 'panel')
  })

  it('falls back to item_id when item_url is missing on one side', () => {
    const a = [{ item_id: 5, item_url: 'https://a/album/x' }]
    const b = [{ item_id: 5 }]
    const merged = mergeReleases(a, b)
    assert.strictEqual(merged.length, 1)
    assert.strictEqual(merged[0].item_url, 'https://a/album/x')
  })

  it('keeps disjoint entries from both lists', () => {
    const a = [{ item_id: 1, item_url: 'https://a/1' }]
    const b = [{ item_id: 2, item_url: 'https://a/2' }]
    assert.strictEqual(mergeReleases(a, b).length, 2)
  })

  it('keeps entries that have neither item_url nor item_id (no key, no dedup)', () => {
    const a = [{ stray: true }]
    const b = [{ stray: true }]
    assert.strictEqual(mergeReleases(a, b).length, 2)
  })

  it('ignores non-array inputs without throwing', () => {
    assert.deepStrictEqual(mergeReleases(null, [{ item_url: 'https://a/1' }]), [{ item_url: 'https://a/1' }])
    assert.deepStrictEqual(mergeReleases(undefined, undefined), [])
  })
})

describe('releaseKey', () => {
  it('prefers item_url over item_id', () => {
    assert.strictEqual(releaseKey({ item_url: 'https://a/x', item_id: 1 }), 'url:https://a/x')
  })

  it('falls back to item_id when item_url is absent', () => {
    assert.strictEqual(releaseKey({ item_id: 7 }), 'id:7')
  })

  it('returns null for non-objects and missing-key objects', () => {
    assert.strictEqual(releaseKey(null), null)
    assert.strictEqual(releaseKey(undefined), null)
    assert.strictEqual(releaseKey({}), null)
  })
})
