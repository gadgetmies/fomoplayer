import React from 'react'
import browser from '../browser'

const getActiveTab = async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  return tab
}

const sendToActiveContent = async (message) => {
  const tab = await getActiveTab()
  if (!tab || typeof tab.id !== 'number') return null
  try {
    return await browser.tabs.sendMessage(tab.id, message)
  } catch (e) {
    return null
  }
}

const readTralbumDataFromActive = async () => {
  const tab = await getActiveTab()
  if (!tab || typeof tab.id !== 'number') return null
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => window.TralbumData ?? null,
    })
    return result?.result ?? null
  } catch (e) {
    return null
  }
}

export default class BandcampPanel extends React.Component {
  constructor(props) {
    super(props)
    this.state = { loggedIn: false, hasPlayables: false, onSubdomain: false }
  }

  async componentDidMount() {
    const probe = await sendToActiveContent({ type: 'bandcamp:probe' })
    if (probe) {
      this.setState({
        loggedIn: !!probe.loggedIn,
        hasPlayables: !!probe.hasPlayables,
        onSubdomain: !!probe.onSubdomain,
      })
    }
  }

  async sendCurrentPage() {
    this.props.setRunning(true)
    try {
      const tralbum = await readTralbumDataFromActive()
      if (!tralbum) throw new Error('Bandcamp page did not expose window.TralbumData')
      await browser.runtime.sendMessage({
        type: 'tracks',
        store: 'bandcamp',
        done: true,
        data: { type: 'tracks', tracks: tralbum },
      })
    } catch (e) {
      browser.runtime.sendMessage({
        type: 'error',
        message: 'Sending tracks from current Bandcamp page failed!',
        stack: e?.stack || String(e),
      })
      this.props.setRunning(false)
    }
  }

  async sendFeed() {
    this.props.setRunning(true)
    try {
      await sendToActiveContent({ type: 'bandcamp:scrape-feed', pageCount: 5 })
    } catch (e) {
      browser.runtime.sendMessage({
        type: 'error',
        message: 'Sending tracks from Bandcamp feed failed!',
        stack: e?.stack || String(e),
      })
      this.props.setRunning(false)
    }
  }

  async syncWishlist() {
    this.props.setRunning(true)
    try {
      const result = await sendToActiveContent({ type: 'bandcamp:trigger-wishlist-sync' })
      if (!result?.ok) throw new Error(result?.error || 'Wishlist sync failed')
    } catch (e) {
      browser.runtime.sendMessage({
        type: 'error',
        message: 'Bandcamp wishlist sync failed',
        stack: e?.stack || String(e),
      })
    } finally {
      this.props.setRunning(false)
    }
  }

  render() {
    const { running, isCurrent } = this.props
    const { loggedIn, hasPlayables, onSubdomain } = this.state

    return (
      <div>
        <h2>Bandcamp</h2>
        {!isCurrent ? (
          <p>
            <button
              id="bandcamp-open"
              onClick={() => browser.tabs.create({ active: true, url: 'https://bandcamp.com' })}
            >
              Open Bandcamp
            </button>
          </p>
        ) : (
          <>
            <p>
              <button
                id="bandcamp-current"
                disabled={running || !hasPlayables}
                onClick={() => this.sendCurrentPage()}
              >
                Send tracks from current page
              </button>
              <br />
            </p>
            <h3>Sync (Requires login)</h3>
            <p>
              <button
                id="bandcamp-feed"
                disabled={running || !loggedIn || onSubdomain}
                onClick={() => this.sendFeed()}
              >
                Feed
              </button>
            </p>
            <p>
              <button
                id="bandcamp-wishlist-sync"
                disabled={running || !loggedIn}
                onClick={() => this.syncWishlist()}
                title="Open your wishlist page first, then click to mirror it into a Fomo Player cart."
              >
                Sync wishlist to Fomo Player cart
              </button>
            </p>
          </>
        )}
      </div>
    )
  }
}
