import React from 'React'
import waitFunction from './wait.js'

const sendBandcampFeedScript = (type, fetchCount) => `
${waitFunction}

async function sendTracks(firstPage, lastPage, olderThan = Date.now()) {
  if (firstPage > lastPage) {
    return
  }

  const collectionResponse = await fetch('https://bandcamp.com/api/fan/2/collection_summary')
  const fanId = (await collectionResponse.json()).fan_id

  const feedResponse = await fetch('https://bandcamp.com/fan_dash_feed_updates', {
    method: 'POST',
    headers: {
      credentials: 'include',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'fan_id=' + fanId + '&older_than=' + olderThan
  })

  const feed = await feedResponse.json()
  const newReleases = feed.stories.entries.filter(({story_type}) => story_type === 'nr')
  chrome.runtime.sendMessage({type: 'releases', store: 'bandcamp', data: newReleases})
  console.log(feed.stories.oldest_story_date)
  sendTracks(firstPage + 1, lastPage, feed.stories.oldest_story_date)
}

sendTracks(1, ${fetchCount})
`

export default function BandcampPanel({ isCurrent, setRunning, running, key }) {
  return <div key='bandcamp-panel' key={key}>
    <h2>Bandcamp</h2>
    {!isCurrent ?
      <p><button id="bandcamp-open"
        onClick={() =>
          chrome.tabs.create({ active: true, url: `https://bandcamp.com` })}>Open Bandcamp</button></p> :
      <>
        <p>
          <button id="bandcamp-current" disabled={running} onClick={() => {
            chrome.tabs.executeScript({
              code: `chrome.runtime.sendMessage({
                      type: 'tracks', store: 'bandcamp', data: window.TralbumData, done: true
                    })`
            })
          }}>Send tracks from current page</button><br />
        </p>
        <h3>Sync (Requires login)</h3>
        <p>
          <button id="bandcamp-feed" disabled={running} onClick={() => {
            setRunning(true)
            try {
              chrome.tabs.executeScript({
                code: sendBandcampFeedScript('new', 2)
              })
            } catch (e) {
              console.error(e)
              setRunning(false)
            }
          }}>Feed</button>
        </p>
      </>
    }
  </div>
}
