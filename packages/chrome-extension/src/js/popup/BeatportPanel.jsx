import React from 'react'
import waitFunction from './wait.js'
import Status from './Status.jsx'

const sendBeatportTracksScript = (urlTemplate, type, pageCount = 10) => `
${waitFunction}
var urlTemplate = ${urlTemplate}

function sendError(errorText) {
  chrome.runtime.sendMessage({type: 'error', message: 'Failed to send Beatport tracks', stack: errorText})
}

function sendTracks(firstPage, lastPage) {
  try {
    if (firstPage > lastPage) {
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
        try {
          var script = document.getElementById('playables') || document.createElement('script')
          script.type = 'text/plain'
          script.id = 'playables'
          script.text = JSON.stringify({type: '${type}', tracks: playables.tracks})
          document.documentElement.appendChild(script)
        } catch (e) {
          var script = document.getElementById('error') || document.createElement('script')
          script.type = 'text/plain'
          script.id = 'error'
          script.text = JSON.stringify(e.stack)
          document.documentElement.appendChild(script)
        }
      })
    \`
    iframe.contentWindow.document.documentElement.appendChild(script)
  
    chrome.runtime.sendMessage({type: 'operationStatus', text: 'Fetcing tracks', progress: firstPage / lastPage * 100})
  
    wait(() => iframe.contentWindow.document.getElementById('playables'), (result) => {
      chrome.runtime.sendMessage({type: 'tracks', done: firstPage === lastPage, store: 'beatport', data: JSON.parse(result.text)})
      sendTracks(firstPage+1, lastPage)
    })   
    wait(() => iframe.contentWindow.document.getElementById('error'), (result) => {
      sendError(result.text)
    })
  } catch (e) {
    sendError(e.stack)
  }
}

sendTracks(1, ${pageCount})
`

const myBeatportUrlFn = 'page => `https://www.beatport.com/my-beatport?page=${page}&per-page=150`'
const myDownloadsUrlFn = 'page => `https://www.beatport.com/downloads/downloaded?page=${page}`'
const getCurrentUrl = tabArray => tabArray[0].url

export default class BeatportPanel extends React.Component {
  constructor(props) {
    super(props)
    this.state = { loggedIn: false }
  }

  sendTracks(urlTemplate, type, pageCount) {
    try {
      this.props.setRunning(true)
      chrome.tabs.executeScript({
        code: sendBeatportTracksScript(urlTemplate, type, pageCount)
      })
    } catch (e) {
      chrome.runtime.sendMessage({ type: 'error', message: 'Failed to send Beatport tracks!', stack: e.stack })
    }
  }

  componentDidMount() {
    const that = this
    chrome.tabs.executeScript(
      {
        code: `document.querySelector('.head-account-link[data-href="/account/profile"]') !== null`
      },
      ([loggedIn]) => {
        that.setState({ loggedIn })
      }
    )
    chrome.tabs.executeScript(
      {
        code: `document.querySelector('.playable-play') !== null`
      },
      ([hasPlayables]) => {
        that.setState({ hasPlayables })
      }
    )
  }

  render() {
    return (
      <div>
        <h2>Beatport</h2>
        {!this.props.isCurrent ? (
          <button
            id="beatport-open"
            onClick={() => chrome.tabs.create({ active: true, url: `https://www.beatport.com` })}
          >
            Open Beatport
          </button>
        ) : this.props.running ? (
          <Status message={this.props.operationStatus} progress={this.props.operationProgress}/>
        ) : (
          <>
            <p>
              <button
                id="beatport-current"
                disabled={!this.state.hasPlayables}
                onClick={() => {
                  const that = this
                  chrome.tabs.query({ active: true, currentWindow: true }, function(tabArray) {
                    that.sendTracks(`() => "${getCurrentUrl(tabArray)}"`, 'tracks', 1)
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
                disabled={!this.state.loggedIn}
                onClick={() => {
                  this.sendTracks(myBeatportUrlFn, 'tracks', 20)
                }}
              >
                My Beatport
              </button>
            </p>
            <p>
              <button
                id="beatport-downloaded"
                disabled={!this.state.loggedIn}
                onClick={() => {
                  this.sendTracks(myDownloadsUrlFn, 'purchased', 20)
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
}
