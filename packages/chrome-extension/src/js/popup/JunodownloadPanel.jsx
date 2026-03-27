import React from 'react'

export default function JunodownloadPanel({ isCurrent, appUrl }) {
  return (
    <div>
      <p key="junodownload-current">
        {isCurrent ? (
          <span>You are on Juno Download. Follow artists and labels from the app to import their tracks.</span>
        ) : (
          <a
            id="junodownload-open"
            href="https://www.junodownload.com"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => chrome.tabs.create({ active: true, url: 'https://www.junodownload.com' })}
          >
            Open Juno Download
          </a>
        )}
      </p>
    </div>
  )
}
