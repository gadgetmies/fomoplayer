import React from 'React'
import waitFunction from './wait.js'

const sendBandcampFeedScript = (type, fetchCount) => `
${waitFunction}

async function sendFeedTracks(firstPage, lastPage, olderThan = Date.now()) {
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
  sendFeedTracks(firstPage + 1, lastPage, feed.stories.oldest_story_date)
}

sendFeedTracks(1, ${fetchCount})
`

const sendBandcampPageScript = (pageUrl) => `
${waitFunction}

var iframe = document.getElementById('playables-frame') || document.createElement('iframe')
iframe.style.display = "none"
iframe.src = "${pageUrl}"
iframe.id = 'playables-frame'
document.body.appendChild(iframe)

var script = document.createElement('script')
script.text = \`
  ${waitFunction}
  wait(() => window.TralbumData, playables => {
    var script = document.getElementById('playables') || document.createElement('script')
    script.type = 'text/plain'
    script.id = 'playables'
    script.text = JSON.stringify({type: 'new', tracks: playables})
    document.documentElement.appendChild(script)
  })
\`
iframe.contentWindow.document.documentElement.appendChild(script)

wait(() => iframe.contentWindow.document.getElementById('playables'), (result) => {
  chrome.runtime.sendMessage({type: 'tracks', done: true, store: 'bandcamp', data: JSON.parse(result.text)})
})
`

const getCurrentUrl = tabArray => tabArray[0].url

export default function BandcampPanel({ isCurrent, setRunning, running, key }) {
  return (
    <div key="bandcamp-panel" key={key}>
      <h2>Bandcamp</h2>
      {!isCurrent ? (
        <p>
          <button id="bandcamp-open" onClick={() => chrome.tabs.create({ active: true, url: `https://bandcamp.com` })}>
            Open Bandcamp
          </button>
        </p>
      ) : (
        <>
          <p>
            <button
              id="bandcamp-current"
              disabled={running}
              onClick={() => {
                setRunning(true)
                chrome.tabs.query({ active: true, currentWindow: true }, function(tabArray) {
                  chrome.tabs.executeScript({
                    code: sendBandcampPageScript(getCurrentUrl(tabArray))
                  })
                })
              }}
            >
              Send tracks from current page
            </button>
            <br />
          </p>
          <h3>Sync (Requires login)</h3>
          <p>
            <button
              id="bandcamp-feed"
              disabled={running}
              onClick={() => {
                setRunning(true)
                try {
                  chrome.tabs.executeScript({
                    code: sendBandcampFeedScript('new', 2)
                  })
                } catch (e) {
                  console.error(e)
                  setRunning(false)
                }
              }}
            >
              Feed
            </button>
          </p>
        </>
      )}
    </div>
  )
}
