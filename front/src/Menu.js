import React, {Component} from 'react'
import Login from './Login.js'
import SessionLogin from './SessionLogin.js'
import CookieLogin from './CookieLogin.js'
import requestJSONwithCredentials from './request-json-with-credentials.js'
import BPromise from 'bluebird'
import './Menu.css'

// TODO: merge with App.js
const getJsonFromResults = results => {
  if (results.ok) {
    return results.json()
  } else {
    throw new Error('Request failed')
  }
}

export default class Menu extends Component {
  constructor(props) {
    super(props)

    this.state = {
      validSessions: new Set()
    }
  }

  updateLogins() {
    return BPromise.each(['beatport', 'bandcamp'],
      store =>
        requestJSONwithCredentials({ path: `/stores/${store}/session-valid` })
          .then(getJsonFromResults)
          .catch(e => ({ validSession: false }))
          .then(({ validSession }) => {
            const newValidSessions = new Set(this.state.validSessions)
            newValidSessions[validSession ? 'add' : 'delete'](store)

            if (validSession) {
              this.props.onLoginDone(store)
            }

            return this.setState({
              validSessions: newValidSessions
            })
          })
    )
  }

  componentDidMount() {
    this.updateLogins()
  }

  render() {
    return <div id="menu" className={"menu-container"}>
      <div className={"menu-stores"}>
        <h2>Stores</h2>
        {
          this.state.loading ? // TODO: dead code?
            <div>Loading...</div>
            :
            <ul className={'store-list'}>
            <li className={"store-list-item"} key={"beatport"}>
              <h3>Beatport</h3>
              {
                this.state.validSessions.has('beatport') ?
                  [<button
                    disabled={this.state.loggingOut}
                    className={'button menu-item login-button button-push_button-small button-push_button-primary'}
                    onClick={() =>
                      requestJSONwithCredentials({
                        path: '/stores/beatport/logout',
                        method: 'POST'
                      })
                        .then(() => this.updateLogins())}>
                    Logout
                    </button>,
                    <button
                    disabled={this.state.loggingOut}
                    className={'button menu-item login-button button-push_button-small button-push_button-primary'}
                    onClick={() =>
                      requestJSONwithCredentials({
                        path: '/stores/beatport/refresh',
                        method: 'POST'
                      })}>
                    Refresh
                    </button>
                    ] :
                  // <Login
                  //   loginPath={"/stores/beatport/login"}
                  //   size={"small"}
                  //   loginName={"beatport"}
                  //   onLoginDone={() => {
                  //     this.setState({ loggedIn: true })
                  //     this.updateLogins()
                  //     requestJSONwithCredentials({
                  //       path: `/stores/beatport/refresh`,
                  //       method: 'POST'
                  //     })
                  //   }}
                  // />
                  <CookieLogin
                    loginPath={"/stores/beatport/login"}
                    size={"small"}
                    onLoginDone={() => {
                      this.setState({ loggedIn: true })
                      this.updateLogins()
                      requestJSONwithCredentials({
                        path: `/stores/beatport/refresh`,
                        method: 'POST'
                      })
                    }}
                  />
              }
            </li>
            <li className={"store-list-item"} key={"bandcamp"}>
              <h3>Bandcamp</h3>
            {
              this.state.validSessions.has('bandcamp') ?
              [<button
                disabled={this.state.loggingOut}
                className={'button menu-item login-button button-push_button-small button-push_button-primary'}
                onClick={() =>
                  requestJSONwithCredentials({
                    path: '/stores/bandcamp/refresh',
                    method: 'POST'
                  })}>
                Refresh
                </button>,
                <button
                  disabled={this.state.loggingOut}
                  className={'button login-button button-push_button-small button-push_button-primary'}
                  onClick={() =>
                    requestJSONwithCredentials({
                      path: '/stores/bandcamp/logout',
                      method: 'POST'
                    })
                      .then(() => this.updateLogins())}>
                  Logout
                  </button>] :
              <CookieLogin
                loginPath={"/stores/bandcamp/login"}
                size={"small"}
                onLoginDone={() => {
                  this.setState({ loggedIn: true })
                  this.updateLogins()
                  requestJSONwithCredentials({
                    path: `/stores/bandcamp/refresh`,
                    method: 'POST'
                  })
                }}
              />
        }
          </li>
          </ul>
        }
      </div>
    </div>
  }
}
