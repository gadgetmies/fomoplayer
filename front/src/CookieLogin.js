import React, { Component } from 'react'
import { requestWithCredentials } from './request-json-with-credentials.js'
import FontAwesome from 'react-fontawesome'
import PillButton from './PillButton.js'
import SpinneButton from './SpinnerButton.js'

export default class CookieLogin extends Component {
  constructor(props) {
    super(props)
    this.state = {
      loggingIn: false,
      loggingOut: false,
      loginError: false,
      logoutError: false,
      copied: false,
      cookie: ''
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
        body: { cookie: this.state.cookie }
      })
      this.setState({ cookie: '', loginError: false, loggingIn: false })
      this.props.onLoginDone()
    } catch (e) {
      console.error('Login failed', e)
      this.setState({ loginError: true, loggingIn: false })
    }
  }

  render() {
    return this.props.loggedIn ?
      <>
        {this.props.loggedInContent}
        <button
          disabled={this.state.loggingOut}
          className={`button login-button button-push_button-${this.props.size} button-push_button-primary` }
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
          e.preventDefault()
          this.submitLogin()
        }}>
        <label className="login-label">
          <span className={`login-label-text login-label-text-${this.props.size}`}>
            Cookie<br/>
          <PillButton
              onClick={(e) => {
                const el = document.createElement('textarea');
                el.value = 'copy(document.cookie)'
                document.body.appendChild(el)
                el.select()
                document.execCommand('copy')
                document.body.removeChild(el)
                e.preventDefault()
                this.setState({ copied: true })
                const that = this
                setTimeout(() => that.setState({ copied: false }), 1000)
              }}>{!this.state.copied ? <>Copy script <FontAwesome name='copy' /></> : 'Copied!'}
            </PillButton>
          </span>
          <input type="text" name="cookie"
            disabled={this.state.loggingIn}
            onChange={e => this.setState({ cookie: e.target.value })}
            className={`text-input login-input text-input-${this.props.size}`}
            value={this.state.cookie}
            onKeyPress={e => {
              if (e.key === "Enter") {
                e.preventDefault()
                this.submitLogin(e)
              }
            }}
          />
        </label>
        <SpinneButton
          className={`login-button`}
          loading={this.state.loggingIn}
          loadingLabel='Logging in'
          label='Login'
          size={this.props.size}
        />
        {this.state.loginError ? <span>Login failed.</span> : null}
        {this.props.loggedOutContent}
      </form>
  }
}
