import React, { Component } from 'react'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials.js'
import Spinner from './Spinner'
import SpinnerButton from './SpinnerButton'
import ExternalLink from './ExternalLink'
import config from './config.js'

export default class Login extends Component {
  constructor(props) {
    super(props)
    this.state = {
      loggingIn: false,
      loggingOut: false,
      loginError: false,
      logoutError: false,
      loggedIn: this.props.loggedIn || false,
      signUpAvailable: null,
      waitingListEmail: '',
      joiningWaitingList: false,
      joinedWaitingList: false,
      joinWaitingListFailed: false,
    }

    this.updateSignUpAvailable()
  }

  async submitJoinWaitingList() {
    this.setState({ joinWaitingListFailed: false, joinedWaitingList: false, joiningWaitingList: true })
    try {
      await requestWithCredentials({
        url: `${config.apiURL}/join-waiting-list`,
        method: 'POST',
        body: { email: this.state.waitingListEmail },
      })
      this.setState({ joinedWaitingList: true })
    } catch (e) {
      console.error(e)
      this.setState({ joinWaitingListFailed: true })
    } finally {
      this.setState({ joiningWaitingList: false })
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

  async updateSignUpAvailable() {
    const { available } = await requestJSONwithCredentials({ url: `${config.apiURL}/sign-up-available` })
    this.setState({ signUpAvailable: available })
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <a
                href={this.props.googleLoginPath}
                className={`button button-push_button login-button button-push_button-${this.props.size} button-push_button-primary`}
              >
                Login {this.state.signUpAvailable && '/ Sign up'} with Google
              </a>
              {this.state.loginError ? 'Login failed' : ''}
            </div>
            {window.location.search.includes('loginFailed=true') && (
              <p>Failed to log in. Please ensure you used the correct account.</p>
            )}
            {this.state.signUpAvailable === null ? (
              <Spinner />
            ) : (
              this.state.signUpAvailable === false && (
                <>
                  <br />
                  <div className="login-separator">Sign up</div>
                  <p>
                    Sadly, the sign up is currently not available. Please <strong>join the waiting list</strong> to be
                    notified when registration is again available.
                  </p>
                  {this.state.joinedWaitingList ? (
                    <p>
                      Thank you for joining the waiting list! A sign up link will be sent to your email when sign up is
                      available.
                    </p>
                  ) : (
                    <>
                      <label>
                        <h4>Email address:</h4>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'center',
                            gap: 8,
                            boxSizing: 'border-box',
                            margin: 'auto',
                            flexDirection: 'column',
                            maxWidth: '15rem',
                          }}
                        >
                          <input
                            type={'email'}
                            className="text-input text-input-large text-input-dark"
                            disabled={this.state.joiningWaitingList}
                            value={this.state.waitingListEmail}
                            onChange={(e) => this.setState({ waitingListEmail: e.target.value })}
                          />
                          <SpinnerButton
                            size={'large'}
                            onClick={this.submitJoinWaitingList.bind(this)}
                            disabled={this.state.joiningWaitingList || this.state.waitingListEmail === ''}
                            loading={this.state.joiningWaitingList}
                          >
                            Join Waiting List
                          </SpinnerButton>
                        </div>
                      </label>
                      {this.state.joinWaitingListFailed && (
                        <>
                          Failed to join waiting list. Please try again later. If the problem persist,
                          <ExternalLink
                            href={'https://github.com/gadgetmies/fomoplayer/issues'}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-onboarding-id="issues-button"
                          >
                            please report an issue on Github
                          </ExternalLink>
                        </>
                      )}
                    </>
                  )}
                </>
              )
            )}
          </>
        )}
      </div>
    )
  }
}
