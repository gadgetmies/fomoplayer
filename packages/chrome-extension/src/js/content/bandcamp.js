// Bandcamp content script. Runs on https://*.bandcamp.com/* and serves scrape
// requests from the popup/worker. Replaces the MV2 `chrome.tabs.executeScript`
// pattern in src/js/popup/BandcampPanel.jsx.
import browser from '../browser'

const reportError = (message, error) =>
  browser.runtime
    .sendMessage({ type: 'error', message, stack: error?.stack || String(error) })
    .catch(() => {})

const reportProgress = (text, progress) =>
  browser.runtime.sendMessage({ type: 'operationStatus', text, progress }).catch(() => {})

const scrapeFeed = async ({ pageCount }) => {
  let olderThan = Date.now()
  const collectionResponse = await fetch('https://bandcamp.com/api/fan/2/collection_summary', {
    credentials: 'include',
  })
  if (!collectionResponse.ok) {
    throw new Error(`collection_summary failed: ${collectionResponse.status}`)
  }
  const fanId = (await collectionResponse.json()).fan_id

  for (let page = 1; page <= pageCount; page += 1) {
    const feedResponse = await fetch('https://bandcamp.com/fan_dash_feed_updates', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `fan_id=${fanId}&older_than=${olderThan}`,
    })
    if (!feedResponse.ok) {
      throw new Error(`fan_dash_feed_updates failed: ${feedResponse.status}`)
    }
    const feed = await feedResponse.json()
    await reportProgress('Fetching releases', Math.round((page / pageCount) * 100))
    const newReleases = feed.stories.entries.filter(({ story_type: storyType }) => storyType === 'nr')
    await browser.runtime.sendMessage({
      type: 'releases',
      store: 'bandcamp',
      done: page === pageCount,
      data: newReleases,
    })
    olderThan = feed.stories.oldest_story_date
  }
}

const probeLoggedIn = () => Boolean(document.querySelector('.userpic'))
const probeHasPlayables = () => Boolean(document.querySelector('.track_list.track_table'))
const probeOnSubdomain = () => {
  try {
    return new URL(window.location.href).hostname !== 'bandcamp.com'
  } catch {
    return false
  }
}

browser.runtime.onMessage.addListener(async (message) => {
  try {
    switch (message?.type) {
      case 'bandcamp:probe':
        return {
          loggedIn: probeLoggedIn(),
          hasPlayables: probeHasPlayables(),
          onSubdomain: probeOnSubdomain(),
        }
      case 'bandcamp:scrape-current-page':
        // The current-page scrape needs MAIN-world access to window.TralbumData;
        // the worker handles that via browser.scripting.executeScript.
        return { ok: false, error: 'Use scripting.executeScript from worker for current-page scrape' }
      case 'bandcamp:scrape-feed':
        await scrapeFeed({ pageCount: message.pageCount || 5 })
        return { ok: true }
      default:
        return undefined
    }
  } catch (e) {
    await reportError(`Bandcamp content script failed: ${message?.type}`, e)
    return { ok: false, error: e?.message }
  }
})
