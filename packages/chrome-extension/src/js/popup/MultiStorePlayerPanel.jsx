import React from 'react'
import Status from './Status'

export default class MultiStorePlayerPanel extends React.Component {
  constructor(props) {
    super(props)
  }

  render() {
    return (
      <div>
        <h2>Player</h2>
        <p>
          <button
            id="player-logout"
            disabled={this.props.running}
            onClick={() => chrome.runtime.sendMessage({ type: 'logging-out' })}
          >
            Logout
          </button>
        </p>
        <p>
          {!this.props.isCurrent ? (
            <button id="player-open" onClick={() => chrome.tabs.create({ active: true, url: this.props.appUrl })}>
              Open Player
            </button>
          ) : null}
        </p>
      </div>
    )
  }
}
