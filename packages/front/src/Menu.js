import React, { Component } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import MenuNavButton from './MenuNavButton'
import { requestWithCredentials } from './request-json-with-credentials.js'
import './Menu.css'

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
          <h2>Fomo Player</h2>
          <MenuNavButton to={'/'} exact={true} onClick={() => this.props.onNavButtonClicked()}>
            Tracks
          </MenuNavButton>
          <h3>User</h3>
          <p>
            <MenuNavButton to={'/settings'} onClick={() => this.props.onNavButtonClicked()}>
              Settings
            </MenuNavButton>
            <button
              className={`button menu-item button-push_button-large button-push_button-menu`}
              onClick={this.logout}
            >
              Logout
            </button>
          </p>
          <h3>Links</h3>
          <p>
            <a
              href={'https://github.com/gadgetmies/fomoplayer/wiki/Getting-started'}
              className={`button menu-item button-push_button-large button-push_button-menu link`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FontAwesomeIcon icon={['fab', 'github']} />
              &nbsp; Instructions
            </a>
            <a
              href={'https://github.com/gadgetmies/fomoplayer#chrome-extension'}
              className={`button menu-item button-push_button-large button-push_button-menu link`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FontAwesomeIcon icon={['fab', 'chrome']} />
              &nbsp; Chrome Extension
            </a>
            <a
              href={'https://github.com/gadgetmies/fomoplayer/issues'}
              className={`button menu-item button-push_button-large button-push_button-menu link`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FontAwesomeIcon icon="exclamation-circle" />
              &nbsp; Report an issue
            </a>
          </p>
        </div>
      </div>
    )
  }
}
