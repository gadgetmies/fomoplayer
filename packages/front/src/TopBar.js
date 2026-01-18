import './TopBar.css'
import React, { Component } from 'react'
import MenuNavButton from './MenuNavButton'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import * as R from 'ramda'
import { Link, NavLink, withRouter } from 'react-router-dom'
import ExternalLink from './ExternalLink'
import Onboarding from './Onboarding'
import SearchBar from './SearchBar'
import DropDownButton from './DropDownButton'
import { isMobile } from 'react-device-detect'
import Popup from './Popup'
import { searchTermsToString, updateTextTerms, getTextValueFromTerms, parseSearchTerms } from './searchTerms'

class TopBar extends Component {
  constructor(props) {
    super(props)

    const searchTerms = props.searchTerms || []
    const textValue = getTextValueFromTerms(searchTerms)
    this.state = {
      requestNotificationSearch: '',
      searchDebounce: undefined,
      searchText: textValue,
      supportMenuOpen: false,
      emailVerificationDismissed: localStorage.getItem('emailVerificationDismissed') === 'true',
      discoverMenuOpen: false,
      cartsMenuOpen: false,
    }
  }

  dismissEmailVerification() {
    localStorage.setItem('emailVerificationDismissed', 'true')
    this.setState({ emailVerificationDismissed: true })
  }

  async setSearch(searchText, skipDebounce = false) {
    this.setState({ searchText })

    if (this.state.searchDebounce) {
      clearTimeout(this.state.searchDebounce)
    }

    const parsedTerms = parseSearchTerms(searchText)
    const searchString = searchTermsToString(parsedTerms)

    if (searchString === '') {
      this.props.onSearch([], this.props.searchFilters)
      return
    }

    const timeout = setTimeout(
      async () => {
        this.setState({ searchDebounce: undefined, listState: 'search' })
        // TODO: cancel this request if new one is requested
        await this.props.onSearch(parsedTerms, { onlyNew: false })
      },
      skipDebounce ? 0 : 1000,
    )
    this.setState({ searchDebounce: timeout })
  }

  getNotificationSubscriptions() {
    const searchString = searchTermsToString(this.props.searchTerms || [])
    return this.props.notifications.filter(R.propEq('text', searchString?.toLocaleLowerCase()))
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevProps.searchTerms !== this.props.searchTerms) {
      const textValue = getTextValueFromTerms(this.props.searchTerms || [])
      const prevTextValue = getTextValueFromTerms(prevProps.searchTerms || [])
      const currentInputMatchesPrevProps = this.state.searchText.trim() === prevTextValue.trim()
      if (textValue !== prevTextValue && currentInputMatchesPrevProps) {
        this.setState({ searchText: textValue })
      }
    }
  }

  render() {
    const notificationSubscriptions = this.getNotificationSubscriptions()
    const subscribed = notificationSubscriptions.length > 0
    const searchString = searchTermsToString(this.props.searchTerms || [])
    const notificationSubscriptionDisabled =
      searchString === '' || this.state.modifyingNotification || !this.props.emailVerified
    const notificationSubscriptionLoading = this.state.modifyingNotification

    return (
      <div className="top_bar">
        <div className="top_bar_contents">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} className="menu_left">
            <Popup
              anchor={
                <MenuNavButton
                  label="Discover"
                  icon={<FontAwesomeIcon icon="play" />}
                  to={isMobile ? '' : '/tracks/new'}
                  selected={['recent', 'new', 'heard'].includes(this.props.listState)}
                />
              }
              open={this.state.discoverMenuOpen}
              onOpenChanged={(open) => this.setState({ discoverMenuOpen: open })}
              popupClassName={'popup_content-right'}
            >
              <div style={{ flexDirection: 'column', display: 'flex', minWidth: 250 }}>
                <NavLink
                  style={(isActive) => ({ opacity: isActive ? 1 : 0.7 })}
                  to={'/tracks/new'}
                  className={'pill pill-button button-push_button-small'}
                  onClick={() => this.setState({ discoverMenuOpen: false })}
                >
                  <span className={'pill-button-contents button-push_button_label'}>New tracks</span>
                </NavLink>
                <NavLink
                  style={(isActive) => ({ opacity: isActive ? 1 : 0.7 })}
                  to={'/tracks/recent'}
                  className={'pill pill-button button-push_button-small'}
                  onClick={() => this.setState({ discoverMenuOpen: false })}
                >
                  <span className={'pill-button-contents button-push_button_label'}>Recently added</span>
                </NavLink>
                <NavLink
                  style={(isActive) => ({ opacity: isActive ? 1 : 0.7 })}
                  to={'/tracks/heard'}
                  className={'pill pill-button button-push_button-small'}
                  onClick={() => this.setState({ discoverMenuOpen: false })}
                >
                  <span className={'pill-button-contents button-push_button_label'}>Recently played</span>
                </NavLink>
              </div>
            </Popup>
            <Popup
              anchor={
                <MenuNavButton
                  label="Carts"
                  icon={<FontAwesomeIcon icon="cart-shopping" />}
                  selected={this.props.listState === 'carts'}
                  to={isMobile ? '' : `/carts/${this.props.carts.find(R.prop('is_default')).uuid}`}
                />
              }
              open={this.state.cartsMenuOpen}
              onOpenChanged={(open) => this.setState({ cartsMenuOpen: open })}
              popupClassName={'popup_content-right'}
            >
              <div style={{ flexDirection: 'column', display: 'flex', minWidth: 250, overflowY: 'auto' }}>
                {this.props.carts.map(({ name, uuid }) => (
                  <NavLink
                    style={(isActive) => ({ opacity: isActive ? 1 : 0.7 })}
                    to={`/carts/${uuid}`}
                    className={'pill pill-button button-push_button-small'}
                    onClick={() => {
                      this.setState({ cartsMenuOpen: false })
                      this.props.onSelectCart(uuid)
                    }}
                    key={uuid}
                  >
                    <span className={'pill-button-contents'}>{name}</span>
                  </NavLink>
                ))}
              </div>
            </Popup>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} className={`menu_search`}>
            <SearchBar
              onChange={(e) => this.setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.code === 'Enter') {
                  if (this.state.searchDebounce) {
                    clearTimeout(this.state.searchDebounce)
                    this.setState({ searchDebounce: undefined })
                  }
                  const parsedTerms = parseSearchTerms(this.state.searchText)
                  return this.props.onSearch(parsedTerms, { onlyNew: false })
                }
              }}
              value={this.state.searchText}
              onClearSearch={() => this.setSearch('')}
              styles={`top_bar`}
              className={`${this.props.searchActive ? '' : 'search__inactive'}`}
            />
            {this.props.searchActive && (
              <>
                <span
                  className={`subscribe_button popup_container ${
                    !this.props.userSettings.emailVerified ? 'email_not_verified' : ''
                  }`}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <DropDownButton
                    size={'top_bar'}
                    onClick={async (e) => {
                      e.stopPropagation()
                      this.setState({ modifyingNotification: true })
                      await this.props.handleToggleNotificationClick(this.props.searchTerms || [], !subscribed)
                      this.setState({ modifyingNotification: false })
                    }}
                    disabled={notificationSubscriptionDisabled}
                    loading={notificationSubscriptionLoading}
                    icon={subscribed ? 'bell-slash' : 'bell'}
                    label={subscribed ? 'Unsubscribe' : 'Subscribe'}
                    popupClassName={'popup_content-left'}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {this.props.stores?.map(({ storeName, purchaseAvailable }) => {
                        const isSubscribed = notificationSubscriptions.some(R.propEq('storeName', storeName))
                        return (
                          <button
                            disabled={notificationSubscriptionDisabled}
                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                            className="button button-push_button button-push_button-small button-push_button-primary"
                            onClick={async (e) => {
                              e.stopPropagation()
                              try {
                                this.setState({ modifyingNotification: true })
                                await this.props.handleToggleNotificationClick(this.props.searchTerms || [], !isSubscribed, [
                                  storeName,
                                ])
                              } finally {
                                this.setState({ modifyingNotification: false })
                              }
                            }}
                            key={`store-${storeName}`}
                          >
                            <FontAwesomeIcon icon={isSubscribed ? 'bell-slash' : 'bell'} />
                            <span style={{ flex: 1, textAlign: 'left' }}>{storeName}</span>
                            {purchaseAvailable && <FontAwesomeIcon icon="money-bills" />}
                          </button>
                        )
                      })}
                    </div>
                  </DropDownButton>
                </span>
                {!this.props.userSettings.emailVerified && !this.state.emailVerificationDismissed && (
                  <div
                    style={{
                      padding: '0 8px 0 4px',
                      height: '100%',
                      flex: 0,
                    }}
                    className="email_not_verified_container popup_container"
                  >
                    <span
                      className={'popup-anchor'}
                      style={{ height: '100%', display: 'flex', gap: 8, alignItems: 'center' }}
                    >
                      <FontAwesomeIcon icon={'circle-exclamation'} />{' '}
                      <span className="button-top_bar_button_label" style={{ fontSize: '75%' }}>
                        Subscription unavailable
                      </span>
                    </span>
                    <div
                      className={'popup_content popup_content-notification popup_content-left'}
                      style={{ minWidth: 250, flexDirection: 'column' }}
                    >
                      <span style={{ padding: '1rem' }}>
                        E-mail is not set or verified.{' '}
                        <Link to={'/settings/following'}>
                          <strong>Please update details in the settings</strong>.
                        </Link>
                      </span>
                      <button
                        className={'button button-push_button button-push_button-primary button-push_button-small'}
                        onClick={this.dismissEmailVerification.bind(this)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div style={{ alignItems: 'center' }} className="menu_right">
            <Popup
              open={this.state.supportMenuOpen}
              onOpenChanged={(open) => this.setState({ supportMenuOpen: open })}
              anchor={
                <div
                  style={{ padding: '0 8px', display: 'flex', alignItems: 'center' }}
                  className={'support_menu_label'}
                  data-onboarding-id="support-button"
                  onMouseEnter={() => {
                    if (Onboarding.active && Onboarding.isCurrentStep(Onboarding.steps.Support)) {
                      this.setState({ supportMenuOpen: true })
                      setTimeout(() => Onboarding.helpers.next(), 500)
                    }
                  }}
                >
                  <span className="button-top_bar_button_icon">
                    <FontAwesomeIcon icon="life-ring" />
                  </span>
                  <span className="button-top_bar_button_label">Support </span>
                  <FontAwesomeIcon icon="caret-down" className="support_menu_label_arrow" />
                </div>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  className="button button-push_button button-push_button-large button-push_button-primary"
                  onClick={() => {
                    this.props.history.push('/new')
                    this.setState({ supportMenuOpen: false })
                    this.props.onOnboardingButtonClicked()
                  }}
                >
                  <FontAwesomeIcon icon="circle-question" onClick={this.props.onHelpButtonClicked} /> Show Tutorial
                </button>
                {!isMobile && (
                  <button
                    onClick={() => {
                      this.setState({ supportMenuOpen: false })
                      this.props.onKeyboardShortcutsClicked()
                    }}
                    className="button button-push_button button-push_button-large button-push_button-primary"
                  >
                    <FontAwesomeIcon icon="keyboard" className="popup-anchor" data-help-id="keyboard-shortcuts" />{' '}
                    Keyboard Shortcuts
                  </button>
                )}
                <ExternalLink
                  href={'https://github.com/gadgetmies/fomoplayer/wiki/Getting-started'}
                  className={`pill pill-link pill-link-large`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-onboarding-id="instructions-button"
                >
                  <FontAwesomeIcon icon={['fab', 'github']} />
                  &nbsp; Instructions
                </ExternalLink>
                <ExternalLink
                  href={'https://github.com/gadgetmies/fomoplayer#chrome-extension'}
                  className={`pill pill-link pill-link-large`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FontAwesomeIcon icon={['fab', 'chrome']} />
                  &nbsp; Chrome Extension
                </ExternalLink>
                <ExternalLink
                  href={'https://github.com/gadgetmies/fomoplayer/issues'}
                  className={`pill pill-link pill-link-large`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-onboarding-id="issues-button"
                >
                  <FontAwesomeIcon icon="exclamation-circle" />
                  &nbsp; Report an issue
                </ExternalLink>
                <ExternalLink
                  href={'https://github.com/gadgetmies/fomoplayer/discussions/new?category=ideas'}
                  className={`pill pill-link pill-link-large`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-onboarding-id="improvements-button"
                >
                  <FontAwesomeIcon icon="lightbulb" />
                  &nbsp; Share improvement ideas
                </ExternalLink>
              </div>
            </Popup>
            <MenuNavButton
              to={'/settings/following'}
              onClick={() => {
                if (Onboarding.active && Onboarding.isCurrentStep(Onboarding.steps.Settings)) {
                  setTimeout(() => Onboarding.helpers.next(), 500)
                }
              }}
              data-onboarding-id="settings-button"
              label={'Settings'}
              icon={<FontAwesomeIcon icon="cog" />}
              className={'settings_button'}
              selected={this.props.listState === 'settings'}
            />
            <div style={{ display: 'flex', alignItems: 'center' }} className="logout_container">
              <button
                className={`button button-push_button button-push_button-top_bar button-push_button-primary`}
                style={{ display: 'flex', gap: 8 }}
                onClick={this.props.onLogoutClicked}
              >
                <span className={'button-top_bar_button_label'}>Logout</span>
                <span className={'button-top_bar_button_icon'}>
                  <FontAwesomeIcon icon={'right-from-bracket'} />
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

export default withRouter(TopBar)
