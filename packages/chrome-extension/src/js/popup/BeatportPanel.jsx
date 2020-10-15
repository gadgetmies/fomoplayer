import React from 'React'
import waitFunction from './wait.js'

const sendBeatportTracksScript = (urlTemplate, type, pageCount = 10) => `
${waitFunction}
var urlTemplate = ${urlTemplate}

function sendTracks(firstPage, lastPage) {
  if (firstPage > lastPage) {
    chrome.runtime.sendMessage({type: 'done'})
    return
  }

  var iframe = document.getElementById('playables-frame') || document.createElement('iframe')
  iframe.style.display = "none"
  iframe.src = urlTemplate(firstPage)
  iframe.id = 'playables-frame'
  document.body.appendChild(iframe)

  var script = document.createElement('script')
  script.text = \`
    ${waitFunction}
    wait(() => window.Playables, playables => {
      var script = document.getElementById('playables') || document.createElement('script')
      script.type = 'text/plain'
      script.id = 'playables'
      script.text = JSON.stringify({type: '${type}', tracks: playables.tracks})
      document.documentElement.appendChild(script)
    })
  \`
  iframe.contentWindow.document.documentElement.appendChild(script)

  wait(() => iframe.contentWindow.document.getElementById('playables'), (result) => {
    chrome.runtime.sendMessage({type: 'tracks', store: 'beatport', data: JSON.parse(result.text)})
    sendTracks(firstPage+1, lastPage)
  })
}

sendTracks(1, ${pageCount})
`
const myBeatportUrlFn = 'page => `https://www.beatport.com/my-beatport?page=${page}&per-page=150`'
const myDownloadsUrlFn = 'page => `https://www.beatport.com/downloads/downloaded?page=${page}`'
const getCurrentUrl = tabArray => tabArray[0].url

export default function BeatportPanel({ isCurrent, setRunning, running, key }) {
  const sendTracks = (urlTemplate, type, pageCount) => {
    setRunning(true)
    chrome.tabs.executeScript({
      code: sendBeatportTracksScript(urlTemplate, type, pageCount)
    })
  }

  return (
    <div key="beatport-panel" key={key}>
      <h2>Beatport</h2>
      {!isCurrent ? (
        <button
          id="beatport-open"
          onClick={() => chrome.tabs.create({ active: true, url: `https://www.beatport.com` })}
        >
          Open Beatport
        </button>
      ) : (
        <>
          <p>
            <button
              id="beatport-current"
              disabled={running}
              onClick={() => {
                chrome.tabs.query({ active: true, currentWindow: true }, function(tabArray) {
                  sendTracks(`() => ${getCurrentUrl(tabArray)}`, 'new', 1)
                })
              }}
            >
              Send tracks from current page
            </button>
          </p>
          <h3>Sync (Requires login)</h3>
          <p>
            <button
              id="beatport-new"
              disabled={running}
              onClick={() => {
                sendTracks(myBeatportUrlFn, 'new', 1)
              }}
            >
              My Beatport
            </button>
          </p>
          <p>
            <button
              id="beatport-downloaded"
              disabled={running}
              onClick={() => {
                sendTracks(myDownloadsUrlFn, 'downloaded')
              }}
            >
              Downloaded
            </button>
          </p>
        </>
      )}
    </div>
  )
}
