import React from 'react'
import waitFunction from './wait.js'

const sendBeatportTracksScript = (urlTemplate, type, pageCount = 10) => {
  function sendError(errorText) {
    chrome.runtime.sendMessage({ type: 'error', message: 'Failed to send Beatport tracks', stack: errorText })
  }

  const getQueryData = (pageSource) => JSON.parse(document.getElementById('__NEXT_DATA__').innerText)

  function sendTracks(firstPage, lastPage) {
    try {
      if (firstPage > lastPage) {
        return
      }

      chrome.runtime.sendMessage({
        type: 'operationStatus',
        text: 'Fetcing tracks',
        progress: (firstPage / lastPage) * 100,
      })

      var iframe = document.getElementById('playables-frame') || document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = urlTemplate(firstPage)
      iframe.id = 'playables-frame'
      document.body.appendChild(iframe)

      var script = document.createElement('script')
      script.text = `
      ${waitFunction}
      wait(() => document.getElementById('__NEXT_DATA__'), () => {
        try {
          const nextData = getQueryData()
          var script = document.getElementById('playables') || document.createElement('script')
          script.type = 'text/plain'
          script.id = 'playables'
          script.text = JSON.stringify({type: '${type}', tracks: nextData.props.pageProps.dehydratedState.queries[0].state.data})
          document.documentElement.appendChild(script)
        } catch (e) {
          var script = document.getElementById('error') || document.createElement('script')
          script.type = 'text/plain'
          script.id = 'error'
          script.text = JSON.stringify(e.stack)
          document.documentElement.appendChild(script)
        }
      })
    `
      iframe.contentWindow.document.documentElement.appendChild(script)

      wait(
        () => iframe.contentWindow.document.getElementById('playables'),
        (result) => {
          chrome.runtime.sendMessage({
            type: 'tracks',
            done: firstPage === lastPage,
            store: 'beatport',
            data: JSON.parse(result.text),
          })
          sendTracks(firstPage + 1, lastPage)
        },
      )
      wait(
        () => iframe.contentWindow.document.getElementById('error'),
        (result) => {
          sendError(result.text)
        },
      )
    } catch (e) {
      sendError(e.stack)
    }

    sendTracks(1, pageCount)
  }
}

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

function sendError(errorText) {
  chrome.runtime.sendMessage({ type: 'error', message: 'Failed to send Beatport tracks', stack: errorText })
}
const sendBeatportLibrary = async () => {
  try {
    for (let page = 1; page < 20; page++) {
      console.log('sendBeatportLibrary', page)
      console.log('progress')
      // chrome.runtime.sendMessage({
      //   type: 'operationStatus',
      //   text: 'Fetching library',
      //   progress: (page / 20) * 100,
      // })
      console.log('fetch')
      // TODO: Fix library id
      const myBeatportResponse = await fetch(
        `https://www.beatport.com/_next/data/4PPQvRX8BFQl1WkKFqzuh/en/library.json?name=&page=${page}&per_page=50`,
      )
      console.log('library')
      const myLibrary = await myBeatportResponse.json()
      console.log({ myLibrary })
      chrome.runtime.sendMessage({ type: 'purchased', store: 'beatport', data: myLibrary })
      await new Promise((resolve) => {
        setTimeout(resolve, 10000)
      })
    }
  } catch (e) {
    console.error(e)
    sendError(e.stack)
  }
}

const myBeatportUrlFn = 'page => `https://www.beatport.com/library?name=&page=${page}`'
const getCurrentUrl = (tabArray) => tabArray[0].url

function getCurrentTabId(callback) {
  console.log('getCurrentTabId')
  chrome.tabs.query({ currentWindow: true, active: true }, function (tabArray) {
    console.log({ tabArray })
    return callback(tabArray[0].id)
  })
}

export default class BeatportPanel extends React.Component {
  constructor(props) {
    super(props)
    this.state = { loggedIn: false, selectedCartTracks: props.selectedCartTracks, defaultBeatportCartId: undefined }
    this.updateBeatportCarts()
  }

  componentDidUpdate(prevProps, prevState, snapshot) {
    if (this.props.selectedCartTracks.length > 0 && this.state.selectedCartTracks.length === 0) {
      this.setState({ selectedCartTracks: this.props.selectedCartTracks })
    }
  }

  updateBeatportCarts() {
    console.log('updateBeatportCarts')
    getCurrentTabId((tabId) => {
      console.log('executeScript tabId', tabId)
      chrome.scripting.executeScript(
        {
          func: async () => {
            console.log('fetching beatport carts')
            const res = await fetch('https://www.beatport.com/_next/data/4PPQvRX8BFQl1WkKFqzuh/en/account/carts.json', {
              credentials: 'include',
            })
            if (res.status === 200) {
              return res.json()
            } else {
              throw new Error('Fetching carts failed')
            }
          },
          target: { tabId },
        },
        ([{ result }]) => {
          console.log({ result })
          const defaultBeatportCartId = result.pageProps.dehydratedState.queries[0].state.data.find(
            (cart) => cart.default,
          ).id

          this.setState({
            defaultBeatportCartId,
          })
        },
      )
    })
  }

  sendTracks(urlTemplate, type, pageCount) {
    try {
      this.props.setRunning(true)
      getCurrentTabId((tabId) => {
        chrome.scripting.executeScript({
          func: sendBeatportTracksScript(urlTemplate, type, pageCount),
          target: { tabId },
        })
      })
    } catch (e) {
      chrome.runtime.sendMessage({ type: 'error', message: 'Failed to send My Beatport tracks!', stack: e.stack })
    }
  }

  sendMyLibrary() {
    try {
      this.props.setRunning(true)
      getCurrentTabId((tabId) => {
        for (let page = 1; page < 2; page++) {
          chrome.scripting.executeScript({
            func: sendBeatportLibrary(page),
            target: { tabId },
          })
        }
      })
    } catch (e) {
      chrome.runtime.sendMessage({
        type: 'error',
        message: 'Failed to send My Library tracks!',
        stack: e.stack,
      })
    }
  }

  addToBeatportCart() {
    const findBeatportTrack = ({ name }) => name === 'Beatport'
    const beatportTracks = this.state.selectedCartTracks.filter(({ stores }) => stores.some(findBeatportTrack))
    const defaultBeatportCartId = this.state.defaultBeatportCartId
    console.log({ beatportTracks })
    for (const { stores } of beatportTracks) {
      const beatportTrack = stores.find(findBeatportTrack)
      getCurrentTabId((tabId) => {
        console.log('adding to cart', beatportTrack)
        chrome.scripting.executeScript({
          func: async (cartId, trackId) => {
            const sessionRes = await fetch('https://www.beatport.com/api/auth/session', { credentials: 'include' })
            if (sessionRes.status !== 200) {
              throw new Error('Unable to fetch Beatport access token')
            }
            const {
              token: { accessToken },
            } = await sessionRes.json()

            return fetch(`https://api.beatport.com/v4/my/carts/${cartId}/items/`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                Authorization: 'Bearer ' + accessToken,
              },
              body: JSON.stringify({
                item_id: trackId,
                audio_format_id: 1, // TODO: add options for these
                item_type_id: 1,
                purchase_type_id: 1,
                source_type_id: 6,
              }),
            })
          },
          args: [defaultBeatportCartId, parseInt(beatportTrack.trackId)],
          target: { tabId },
        })
      })
    }
  }

  searchMissingFromBeatport() {}

  sendArtistsAndLabels() {
    try {
      this.props.setRunning(true)
      const tabId = getCurrentTabId()
      chrome.scripting.executeScript({
        func: sendBeatportArtistsAndLabelsScript(),
        target: { tabId },
      })
    } catch (e) {
      chrome.runtime.sendMessage({
        type: 'error',
        message: 'Failed to send My Beatport artists and labels!',
        stack: e.stack,
      })
    }
  }

  componentDidMount() {
    const that = this
    getCurrentTabId((tabId) => {
      console.log({ tabId })
      chrome.scripting.executeScript(
        {
          func: () => document.querySelector('.head-account-link[data-href="/account/profile"]') !== null,
          target: { tabId },
        },
        (result) => {
          that.setState({ loggedIn: !!result })
        },
      )
      chrome.scripting.executeScript(
        {
          func: () => document.querySelector('.playable-play') !== null,
          target: { tabId },
        },
        (result) => {
          console.log({ result })
          that.setState({ hasPlayables: result && result[0]?.result })
        },
      )
    })
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
                  chrome.tabs.query({ active: true, currentWindow: true }, function (tabArray) {
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
            <h3>Cart (requires login)</h3>
            <label>
              Fomo Player cart:
              <select
                onChange={({ target: { value } }) => {
                  this.setState({ selectedCartId: value })
                  chrome.runtime.sendMessage({ type: 'fetchCartTracks', data: value })
                }}
              >
                {this.props.carts.map(({ id, name }) => (
                  <option value={id}>{name}</option>
                ))}
              </select>
            </label>
            <p key={'beatport-add-to-cart'}>
              <button
                id="beatport-add-to-cart"
                disabled={this.props.running || !this.state.loggedIn || this.state.selectedCartTracks.length === 0}
                onClick={() => {
                  this.addToBeatportCart()
                }}
              >
                Add tracks to Beatport cart
              </button>
            </p>
            <p key={'beatport-search-missing'}>
              <button
                id="beatport-search-missing"
                disabled={this.props.running || !this.state.loggedIn || this.state.selectedCartTracks.length === 0}
                onClick={() => {
                  this.searchMissingFromBeatport()
                }}
              >
                Search missing tracks
              </button>
            </p>
          </>
        )}
      </div>
    )
  }
}
