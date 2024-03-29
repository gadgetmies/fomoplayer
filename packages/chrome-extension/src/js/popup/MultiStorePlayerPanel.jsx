import React from 'react'

export default class MultiStorePlayerPanel extends React.Component {
  constructor(props) {
    super(props)
  }

  render() {
    return (
      <div>
        <h2>Player</h2>
        <p key={'player-logout'}>
          <button
            id="player-logout"
            disabled={this.props.running}
            onClick={() => chrome.runtime.sendMessage({ type: 'logging-out' })}
          >
            Logout
          </button>
        </p>
        <p key={'player-open'}>
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
