import React from 'react'
import waitFunction from './wait.js'

const sendErrorFunction = `
function sendError(errorText) {
  chrome.runtime.sendMessage({type: 'error', message: 'Failed to send Beatport tracks', stack: errorText})
}
`

const sendBandcampFeedScript = (fetchCount) => `
${sendErrorFunction}

async function sendFeedTracks(firstPage, lastPage, olderThan = Date.now()) {
  try {
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

    chrome.runtime.sendMessage({type: 'operationStatus', text: 'Fetching releases', progress: firstPage / lastPage * 100})
    const feed = await feedResponse.json()
    const newReleases = feed.stories.entries.filter(({story_type}) => story_type === 'nr')
    chrome.runtime.sendMessage({type: 'releases', done: firstPage === lastPage, store: 'bandcamp', data: newReleases})
    sendFeedTracks(firstPage + 1, lastPage, feed.stories.oldest_story_date)
  } catch (e) {
    sendError(e.stack)
  }
}

sendFeedTracks(1, ${fetchCount})
`

const sendBandcampPageScript = (pageUrl) => `
${waitFunction}

${sendErrorFunction}

try {
  var iframe = document.getElementById('playables-frame') || document.createElement('iframe')
  iframe.style.display = "none"
  iframe.src = "${pageUrl}"
  iframe.id = 'playables-frame'
  document.body.appendChild(iframe)
  
  var script = document.createElement('script')
  script.text = \`
    ${waitFunction}
    wait(() => window.TralbumData, playables => {
      try {
        var script = document.getElementById('playables') || document.createElement('script')
        script.type = 'text/plain'
        script.id = 'playables'
        script.text = JSON.stringify({type: 'tracks', tracks: playables})
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
  
  chrome.runtime.sendMessage({type: 'operationStatus', text: 'Fetcing tracks from page'})
  wait(() => iframe.contentWindow.document.getElementById('playables'), (result) => {
    chrome.runtime.sendMessage({type: 'tracks', done: true, store: 'bandcamp', data: JSON.parse(result.text)})
  })
  
  wait(() => iframe.contentWindow.document.getElementById('error'), (result) => {
    sendError(result.text)
  })
} catch (e) {
  sendError(e.stack)
}
`

const getCurrentUrl = (tabArray) => tabArray[0].url

export default class BandcampPanel extends React.Component {
  constructor(props) {
    super(props)
    this.state = { loggedIn: false }
  }

  componentDidMount() {
    const that = this
    chrome.tabs.executeScript(
      {
        code: `document.querySelector('.userpic') !== null`,
      },
      ([loggedIn]) => {
        that.setState({ loggedIn })
      },
    )
    chrome.tabs.executeScript(
      {
        code: `document.querySelector('.track_list.track_table') !== null`,
      },
      ([hasPlayables]) => {
        that.setState({ hasPlayables })
      },
    )
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabArray) {
      that.setState({ onSubdomain: new URL(getCurrentUrl(tabArray)).hostname !== 'bandcamp.com' })
    })
  }

  render() {
    return (
      <div>
        <h2>Bandcamp</h2>
        {!this.props.isCurrent ? (
          <p>
            <button
              id="bandcamp-open"
              onClick={() => chrome.tabs.create({ active: true, url: `https://bandcamp.com` })}
            >
              Open Bandcamp
            </button>
          </p>
        ) : (
          <>
            <p>
              <button
                id="bandcamp-current"
                disabled={this.props.running || !this.state.hasPlayables}
                onClick={() => {
                  this.props.setRunning(true)
                  chrome.tabs.query({ active: true, currentWindow: true }, function (tabArray) {
                    try {
                      chrome.tabs.executeScript({
                        code: sendBandcampPageScript(getCurrentUrl(tabArray)),
                      })
                    } catch (e) {
                      chrome.runtime.sendMessage({
                        type: 'error',
                        message: 'Sending tracks from current Bandcamp page failed!',
                        stack: e.stack,
                      })
                    }
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
                disabled={this.props.running || !this.state.loggedIn || this.state.onSubdomain}
                onClick={() => {
                  this.props.setRunning(true)
                  try {
                    chrome.tabs.executeScript({
                      code: sendBandcampFeedScript(5),
                    })
                  } catch (e) {
                    chrome.runtime.sendMessage({
                      type: 'error',
                      message: 'Sending tracks from Bandcamp feed failed!',
                      stack: e.stack,
                    })

                    this.props.setRunning(false)
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
}
