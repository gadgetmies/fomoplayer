import React, { Component } from 'react'
import { requestWithCredentials } from './request-json-with-credentials.js'
import * as R from 'ramda'
import SpinnerButton from './SpinnerButton.js'

export default class SessionLogin extends Component {
  constructor(props) {
    super(props)
    this.state = {
      loggingIn: false,
      loggingOut: false,
      loginError: false
    }
  }

  static get defaultProps() {
    return {
      size: 'large'
    }
  }

  async submitLogin() {
    this.setState({ loggingIn: true, loginError: false })

    try {
      await requestWithCredentials({
        path: this.props.loginPath,
        method: 'POST',
        body: R.mapObjIndexed(
          (_, key) => this.state[key],
          this.props.sessionProperties
        )
      })
      this.setState({ loggingIn: false })
      this.props.onLoginDone()
    } catch (e) {
      console.error('Login failed', e)
      this.setState({ loggingIn: false, loginError: true })
    }
  }

  render() {
    return this.props.loggedIn ?
      <>
        {this.props.loggedInContent}
        <button
          disabled={this.state.loggingOut}
          className={`button login-button button-push_button-${this.props.size} button-push_button-primary`}
          onClick={async () => {
            try {
              await requestWithCredentials({
                path: this.props.logoutPath,
                method: 'POST'
              })
              return this.props.onLogoutDone()
            } catch (e) {
              console.error(e)
              this.setState({ logoutError: true })
            }
          }}>
          {this.state.loggingOut ? 'Logging out' : 'Logout'}
        </button>
        {this.state.logoutError ? 'Error login out' : ''}
      </> :
      <form
        className={this.props.className}
        style={{ height: '100%', overflow: 'hidden' }}
        onSubmit={e => {
          e.preventDefault();
          this.submitLogin()
            .then(() => this.props.onLoginDone())
        }
        }>
        {
          Object.keys(this.props.sessionProperties)
            .map(key =>
              <label className="login-label" key={key}>
                <span className={`login-label-text login-label-text-${this.props.size}`}>
                  {this.props.sessionProperties[key]}
                </span>
                <input type="text" name={key}
                  disabled={this.state.loggingIn}
                  onInput={e => this.setState({ [key]: e.target.value })}
                  className={`text-input login-input text-input-${this.props.size}`}
                />
              </label>)
        }
        <SpinnerButton
          className={`login-button`}
          loading={this.state.loggingIn}
          loadingLabel='Logging in'
          label='Login'
          onClick={this.submitLogin.bind(this)}
          size={this.props.size}
        >Login
        </SpinnerButton>
        {
          this.state.loginError ? <span>Login failed.</span> : null
        }
      </form>
  }
}
