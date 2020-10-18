import React, { Component } from 'react'
import { requestWithCredentials } from './request-json-with-credentials.js'
import './Menu.css'
import FontAwesome from 'react-fontawesome'

export default class Menu extends Component {
  constructor(props) {
    super(props)
  }

  logout = async () => {
    try {
      await requestWithCredentials({ path: this.props.logoutPath, method: 'POST' })
    } catch (e) {
      console.error('Logout failed', e)
    }
    this.props.onLogoutDone()
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
