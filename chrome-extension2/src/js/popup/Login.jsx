import React from 'React'

export default function Login(props) {
  return <div id="login">
    <h2>Sign in</h2>
    <p>
      <button id="google-login"
        onClick={() => chrome.runtime.sendMessage({ type: 'oauth-login' })}>Continue with Google</button>
    </p>
    <div className="sign-in-separator">
      or
    </div>
    <p>
      <input className="login-input" type="text" placeholder="Username" /><br />
      <input className="login-input" type="password" placeholder="Password" /><br />
    </p>
    <p>
      <button type="submit" id="login-button">Login</button>
    </p>
  </div >
}
