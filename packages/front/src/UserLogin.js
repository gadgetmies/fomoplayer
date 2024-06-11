import React, { Component } from 'react'
import { requestWithCredentials } from './request-json-with-credentials.js'

export default class Login extends Component {
  constructor(props) {
    super(props)
    this.state = {
      loggingIn: false,
      loggingOut: false,
      loginError: false,
      logoutError: false,
      loggedIn: this.props.loggedIn || false,
    }
  }

  static get defaultProps() {
    return {
      size: 'large',
    }
  }

  async submitLogout() {
    this.setState({ loggingOut: true })
    try {
      await requestWithCredentials({
        path: this.props.logoutPath,
        method: 'POST',
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
              className={`button button-push_button login-button button-push_button-${this.props.size} button-push_button-primary`}
              onClick={this.submitLogout.bind(this)}
            >
              Logout
            </button>
            {this.state.logoutError ? <span>Logout failed.</span> : null}
          </>
        ) : (
          <>
            <a
              href={this.props.googleLoginPath}
              className={`button button-push_button login-button button-push_button-${this.props.size} button-push_button-primary`}
            >
              Login with Google
            </a>
            {this.state.loginError ? 'Login failed' : ''}
          </>
        )}
      </div>
    )
  }
}
