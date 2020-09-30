import React from 'React'

export default function MultiStorePlayerPanel({ isCurrent, running, key }) {
  return (
    <div key={key}>
      <h2>Player</h2>
      <p>
        <button
          id="player-logout"
          disabled={running}
          onClick={() => chrome.runtime.sendMessage({ type: 'logging-out' })}
        >
          Logout
        </button>
      </p>
      <p>
        {!isCurrent ? (
          <button id="player-open" onClick={() => chrome.tabs.create({ active: true, url: PLAYER_UI_URL })}>
            Open Player
          </button>
        ) : null}
      </p>
    </div>
  )
}
