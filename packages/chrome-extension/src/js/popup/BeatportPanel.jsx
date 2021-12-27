import React from 'react'
import waitFunction from './wait.js'

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
    
    chrome.runtime.sendMessage({type: 'operationStatus', text: 'Fetcing tracks', progress: firstPage / lastPage * 100})
  
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

const sendBeatportArtistsAndLabelsScript = () => `
${waitFunction}

function sendError(errorText) {
  chrome.runtime.sendMessage({type: 'error', message: 'Failed to send Beatport tracks', stack: errorText})
}

async function sendArtistsAndLabels() {
  try {
    chrome.runtime.sendMessage({type: 'operationStatus', text: 'Fetching artists and labels', progress: 20})
    const myBeatportResponse = await fetch('https://www.beatport.com/api/my-beatport')
    const artistsAndLabels = await myBeatportResponse.json()
    const artistIds = artistsAndLabels.artists.map(({id, url, name}) => ({id, url, name}))
    const labelIds = artistsAndLabels.labels.map(({id, url, name}) => ({id, url, name}))
    chrome.runtime.sendMessage({type: 'artists', done: true, store: 'beatport', data: artistIds})
    chrome.runtime.sendMessage({type: 'labels', done: true, store: 'beatport', data: labelIds})
  } catch (e) {
    sendError(e.stack)
  }
}

sendArtistsAndLabels()
`

const sendBeatportMyLibraryScript = () => `
${waitFunction}

function sendError(errorText) {
  chrome.runtime.sendMessage({type: 'error', message: 'Failed to send Beatport tracks', stack: errorText})
}

async function sendMyLibrary() {
  try {
    chrome.runtime.sendMessage({type: 'operationStatus', text: 'Fetching library', progress: 20})
    const myBeatportResponse = await fetch('https://www.beatport.com/api/v4/my/downloads?page=1&per_page=5000')
    const myLibrary = await myBeatportResponse.json()
    chrome.runtime.sendMessage({type: 'purchased', store: 'beatport', data: myLibrary.results})
  } catch (e) {
    sendError(e.stack)
  }
}

sendMyLibrary()
`

const myBeatportUrlFn = 'page => `https://www.beatport.com/my-beatport?page=${page}&per-page=150`'
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
      chrome.runtime.sendMessage({ type: 'error', message: 'Failed to send My Beatport tracks!', stack: e.stack })
    }
  }

  sendMyLibrary() {
    try {
      this.props.setRunning(true)
      chrome.tabs.executeScript({
        code: sendBeatportMyLibraryScript()
      })
    } catch (e) {
      chrome.runtime.sendMessage({
        type: 'error',
        message: 'Failed to send My Library tracks!',
        stack: e.stack
      })
    }
  }

  sendArtistsAndLabels() {
    try {
      this.props.setRunning(true)
      chrome.tabs.executeScript({
        code: sendBeatportArtistsAndLabelsScript()
      })
    } catch (e) {
      chrome.runtime.sendMessage({
        type: 'error',
        message: 'Failed to send My Beatport artists and labels!',
        stack: e.stack
      })
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
        ) : (
          <>
            <p key={'beatport-current'}>
              <button
                id="beatport-current"
                disabled={this.props.running || !this.state.hasPlayables}
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
            <h3>Sync (requires login)</h3>
            <p key={'beatport-new-tracks'}>
              <button
                id="beatport-new-tracks"
                disabled={this.props.running || !this.state.loggedIn}
                onClick={() => {
                  this.sendTracks(myBeatportUrlFn, 'tracks', 20)
                }}
              >
                My Beatport tracks
              </button>
            </p>
            <p key={'beatport-new-artists-and-labels'}>
              <button
                id="beatport-new-artists-and-labels"
                disabled={this.props.running || !this.state.loggedIn}
                onClick={() => {
                  this.sendArtistsAndLabels()
                }}
              >
                My Beatport artists and labels
              </button>
            </p>
            <p key={'beatport-downloaded'}>
              <button
                id="beatport-downloaded"
                disabled={this.props.running || !this.state.loggedIn}
                onClick={() => {
                  this.sendMyLibrary()
                }}
              >
                My Library
              </button>
            </p>
          </>
        )}
      </div>
    )
  }
}
