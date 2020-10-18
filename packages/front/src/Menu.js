import React, { Component } from 'react'
import SessionLogin from './SessionLogin.js'
import RefreshButton from './RefreshButton'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials.js'
import BPromise from 'bluebird'
import './Menu.css'
import FontAwesome from 'react-fontawesome'

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
          <p>
            <a href={'https://github.com/gadgetmies/multi_store_player'}
               className={`button menu-item button-push_button-large button-push_button-primary link`}
               target="_blank"
               rel="noopener noreferrer"
            >
              <FontAwesome name="github" />&nbsp;
              Instructions
            </a>
            <a href={'https://github.com/gadgetmies/multi_store_player#chrome-extension'}
              className={`button menu-item button-push_button-large button-push_button-primary link`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FontAwesome name="chrome" />&nbsp;
              Chrome Extension
            </a>
            <a href={'https://github.com/gadgetmies/multi_store_player/issues'}
              className={`button menu-item button-push_button-large button-push_button-primary link`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FontAwesome name="exclamation-circle" />&nbsp;
              Report an issue
            </a>
          </p>
        </div>
      </div>
    )
  }
}
