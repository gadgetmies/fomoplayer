import React, { Component } from 'react'
import SessionLogin from './SessionLogin.js'
import CookieLogin from './CookieLogin.js'
import RefreshButton from './RefreshButton'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials.js'
import BPromise from 'bluebird'
import GitHubButton from 'react-github-btn'
import './Menu.css'

export default class Menu extends Component {
  constructor(props) {
    super(props)

    this.state = {
      validSessions: new Set()
    }
  }

  updateLogins() {
    return BPromise.each(['beatport'], store =>
      requestJSONwithCredentials({ path: `/stores/${store}/session/` })
        .catch(e => ({ valid: false }))
        .then(({ valid }) => {
          const newValidSessions = new Set(this.state.validSessions)
          newValidSessions[valid ? 'add' : 'delete'](store)

          if (valid) {
            this.props.onStoreLoginDone(store)
          }

          return this.setState({
            validSessions: newValidSessions
          })
        })
    )
  }

  logout = async () => {
    try {
      await BPromise.each(['beatport'], store =>
        requestWithCredentials({ path: `/stores/${store}/logout/`, method: 'POST' })
      )

      await requestWithCredentials({ path: this.props.logoutPath, method: 'POST' })
    } catch (e) {
      console.error('Logout failed', e)
    }
    this.props.onLogoutDone()
  }

  componentDidMount() {
    this.updateLogins()
  }

  render() {
    return (
      <div id="menu" className={'menu-container'}>
        <div className={'menu-stores'}>
          <h2>Player</h2>
          <button
            className={`button menu-item button-push_button-large button-push_button-primary`}
            onClick={this.logout}
          >
            Logout
          </button>
          <GitHubButton
            href="https://github.com/gadgetmies/multi_store_player/"
            data-icon="octicon-mark-githubocticon-issue-opened"
            data-size="large"
            aria-label="View gadgetmies/multi_store_player on GitHub"
          >
            View on GitHub
          </GitHubButton>
          <br />
          <GitHubButton
            href="https://github.com/gadgetmies/multi_store_player/issues"
            data-icon="octicon-issue-opened"
            data-size="large"
            aria-label="Issue gadgetmies/multi_store_player on GitHub"
          >
            Create an issue
          </GitHubButton>
          <h2>Stores</h2>
          {
            <ul className={'store-list'}>
              <li className={'store-list-item'} key={'beatport'}>
                <h3>Beatport</h3>
                <SessionLogin
                  loginPath={'/stores/beatport/login'}
                  logoutPath={'/stores/beatport/logout'}
                  size={'large'}
                  loginName={'beatport'}
                  sessionProperties={{
                    csrfToken: 'CSRF Token',
                    sessionCookieValue: 'Session'
                  }}
                  onLoginDone={this.updateLogins.bind(this)}
                  onLogoutDone={this.updateLogins.bind(this)}
                  loggedIn={this.state.validSessions.has('beatport')}
                  loggedInContent={
                    <RefreshButton
                      store={'beatport'}
                      onUpdateTracks={this.props.onUpdateTracks}
                      className="menu-item"
                    />
                  }
                />
              </li>
            </ul>
          }
        </div>
      </div>
    )
  }
}
