import React from 'react'
import browser from '../browser'

export default function Login() {
  return (
    <div id="login">
      <h2>Sign in</h2>
      <p className="login-hint">A new tab will open at the Fomo Player sign-in page.</p>
      <p>
        <button id="fomoplayer-login" onClick={() => browser.runtime.sendMessage({ type: 'login' })}>
          Sign in to Fomo Player
        </button>
      </p>
    </div>
  )
}
