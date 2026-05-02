import React from 'react'
import browser from '../browser'

const getActiveTabId = async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  return tab?.id
}

const sendToActiveContent = async (message) => {
  const tabId = await getActiveTabId()
  if (typeof tabId !== 'number') return null
  try {
    return await browser.tabs.sendMessage(tabId, message)
  } catch (e) {
    // Content script may not yet be loaded on a non-Beatport tab.
    return null
  }
}

export default class BeatportPanel extends React.Component {
  constructor(props) {
    super(props)
    this.state = { loggedIn: false, hasPlayables: false }
  }

  async componentDidMount() {
    const probe = await sendToActiveContent({ type: 'beatport:probe' })
    if (probe) this.setState({ loggedIn: !!probe.loggedIn, hasPlayables: !!probe.hasPlayables })
  }

  async withRunning(action) {
    this.props.setRunning(true)
    try {
      await action()
    } catch (e) {
      browser.runtime.sendMessage({
        type: 'error',
        message: 'Beatport panel action failed',
        stack: e?.stack || String(e),
      })
    }
  }

  render() {
    const { running, isCurrent } = this.props
    const { loggedIn, hasPlayables } = this.state

    return (
      <div>
        <h2>Beatport</h2>
        {!isCurrent ? (
          <button
            id="beatport-open"
            onClick={() => browser.tabs.create({ active: true, url: 'https://www.beatport.com' })}
          >
            Open Beatport
          </button>
        ) : (
          <>
            <p key="beatport-current">
              <button
                id="beatport-current"
                disabled={running || !hasPlayables}
                onClick={() =>
                  this.withRunning(() => sendToActiveContent({ type: 'beatport:scrape-current-page' }))
                }
              >
                Send tracks from current page
              </button>
            </p>
            <h3>Sync (requires login)</h3>
            <p key="beatport-new-tracks">
              <button
                id="beatport-new-tracks"
                disabled={running || !loggedIn}
                onClick={() =>
                  this.withRunning(() =>
                    sendToActiveContent({
                      type: 'beatport:scrape-my-beatport',
                      pageCount: 20,
                      trackType: 'tracks',
                    }),
                  )
                }
              >
                My Beatport tracks
              </button>
            </p>
            <p key="beatport-new-artists-and-labels">
              <button
                id="beatport-new-artists-and-labels"
                disabled={running || !loggedIn}
                onClick={() =>
                  this.withRunning(() => sendToActiveContent({ type: 'beatport:scrape-artists-and-labels' }))
                }
              >
                My Beatport artists and labels
              </button>
            </p>
            <p key="beatport-downloaded">
              <button
                id="beatport-downloaded"
                disabled={running || !loggedIn}
                onClick={() => this.withRunning(() => sendToActiveContent({ type: 'beatport:scrape-my-library' }))}
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
