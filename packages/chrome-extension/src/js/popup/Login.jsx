import React from 'react'

export default function Login() {
  return (
    <div id="login">
      <h2>Sign in</h2>
      <p>
        <button
          id="google-login"
          onClick={() => {
            console.log('click')
            return chrome.runtime.sendMessage({ type: 'oauth-login' })
          }}
        >
          Continue with Google
        </button>
      </p>
    </div>
  )
}
