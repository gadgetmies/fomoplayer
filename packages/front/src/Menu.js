import React, { Component } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import MenuNavButton from './MenuNavButton'
import { requestWithCredentials } from './request-json-with-credentials.js'
import './Menu.css'
import ExternalLink from './ExternalLink'
import Onboarding from './Onboarding'

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
          <MenuNavButton to={'/new'} exact={true} onClick={() => this.props.onNavButtonClicked()}>
            Tracks
          </MenuNavButton>
          <h3>User</h3>
          <p>
            <MenuNavButton
              to={'/settings/'}
              onClick={() => {
                this.props.onNavButtonClicked()
                if (Onboarding.active && Onboarding.isCurrentStep(Onboarding.steps.Settings)) {
                  setTimeout(() => Onboarding.helpers.next(), 500)
                }
              }}
              data-onboarding-id="settings-button"
            >
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
            <ExternalLink
              href={'https://github.com/gadgetmies/fomoplayer/wiki/Getting-started'}
              className={`button menu-item button-push_button-large button-push_button-menu link no-style-link`}
              target="_blank"
              rel="noopener noreferrer"
              data-onboarding-id="instructions-button"
            >
              <FontAwesomeIcon icon={['fab', 'github']} />
              &nbsp; Instructions
            </ExternalLink>
            <ExternalLink
              href={'https://github.com/gadgetmies/fomoplayer#chrome-extension'}
              className={`button menu-item button-push_button-large button-push_button-menu link no-style-link`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FontAwesomeIcon icon={['fab', 'chrome']} />
              &nbsp; Chrome Extension
            </ExternalLink>
            <ExternalLink
              href={'https://github.com/gadgetmies/fomoplayer/issues'}
              className={`button menu-item button-push_button-large button-push_button-menu link no-style-link`}
              target="_blank"
              rel="noopener noreferrer"
              data-onboarding-id="issues-button"
            >
              <FontAwesomeIcon icon="exclamation-circle" />
              &nbsp; Report an issue
            </ExternalLink>
            <ExternalLink
              href={'https://github.com/gadgetmies/fomoplayer/discussions/new?category=ideas'}
              className={`button menu-item button-push_button-large button-push_button-menu link no-style-link`}
              target="_blank"
              rel="noopener noreferrer"
              data-onboarding-id="improvements-button"
            >
              <FontAwesomeIcon icon="lightbulb" />
              &nbsp; Share improvement ideas
            </ExternalLink>
          </p>
        </div>
      </div>
    )
  }
}
