import React, { Component } from 'react'
import { requestWithCredentials } from './request-json-with-credentials.js'

export default class Login extends Component {
  constructor(props) {
    super(props)
    this.state = {
      username: '',
      password: '',
      loggingIn: false,
      loggingOut: false,
      loginError: false,
      logoutError: false,
      loggedIn: this.props.loggedIn || false
    }
  }

  static get defaultProps() {
    return {
      usernameField: 'username',
      passwordField: 'password',
      size: 'large'
    }
  }

  async submitLogin() {
    this.setState({ loggingIn: true })
    try {
      await requestWithCredentials({
        path: this.props.loginPath,
        method: 'POST',
        body: {
          [this.props.usernameField]: this.state.username,
          [this.props.passwordField]: this.state.password
        }
      })

      this.setState({ loggingIn: false, loggedIn: true, loginError: false })
      this.props.onLoginDone()
    } catch (e) {
      this.setState({ loginError: true, loggingIn: false })
    }
  }

  async submitLogout() {
    this.setState({ loggingOut: true })
    try {
      await requestWithCredentials({
        path: this.props.logoutPath,
        method: 'POST'
      })

      this.setState({ loggingOut: false, loggedIn: false, logoutError: false })
      this.props.onLogoutDone()
    } catch (e) {
      this.setState({ logoutError: true, loggingOut: false })
    }
  }

  render() {
    return (
      <div className={this.props.className}>
        {this.state.loggedIn ? (
          <>
            <button
              disabled={this.state.loggingOut}
              className={`button login-button button-push_button-${this.props.size} button-push_button-primary`}
              onClick={this.submitLogout.bind(this)}
            >
              Logout
            </button>
            {this.state.logoutError ? <span>Logout failed.</span> : null}
          </>
        ) : (
          <form
            onSubmit={e => {
              e.preventDefault()
              this.submitLogin()
            }}
          >
            <a
              href={this.props.googleLoginPath}
              className={`button login-button button-push_button-${this.props.size} button-push_button-primary`}
            >
              Continue with Google
            </a>
            <div className="login-separator">or</div>
            <label className="login-label">
              <span className={`login-label-text login-label-text-${this.props.size}`}>Username</span>
              <input
                type="text"
                name={`username-${this.props.loginName}`}
                autoComplete={`username-${this.props.loginName}`}
                disabled={this.state.loggingIn}
                onInput={e => this.setState({ username: e.target.value })}
                className={`text-input login-input text-input-${this.props.size} text-input-light`}
              />
            </label>
            <label className="login-label">
              <span className={`login-label-text login-label-text-${this.props.size}`}>Password</span>
              <input
                type="password"
                name={`password-${this.props.loginName}`}
                autoComplete={`password-${this.props.loginName}`}
                disabled={this.state.loggingIn}
                onInput={e => this.setState({ password: e.target.value })}
                className={`text-input login-input text-input-${this.props.size} text-input-light`}
              />
            </label>
            <button
              type="submit"
              className={`button login-button button-push_button-${this.props.size} button-push_button-primary`}
              disabled={this.state.loggingIn || this.state.loggedIn}
            >
              Login
            </button>
            {this.state.loginError ? 'Login failed' : ''}
          </form>
        )}
      </div>
    )
  }
}
