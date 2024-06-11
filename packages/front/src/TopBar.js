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

class TopBar extends Component {
  constructor(props) {
    super(props)

    const urlSearchParams = new URLSearchParams(props.location.search)
    const query = urlSearchParams.get('q') || ''
    const sort = urlSearchParams.get('sort')

    this.state = {
      requestNotificationSearch: '',
      searchDebounce: undefined,
      searchActive: query !== '',
      search: query,
      sort,
      supportMenuOpen: false,
      emailVerificationDismissed: localStorage.getItem('emailVerificationDismissed') === 'true',
      discoverMenuOpen: false
    }
  }

  dismissEmailVerification() {
    localStorage.setItem('emailVerificationDismissed', 'true')
    this.setState({ emailVerificationDismissed: true })
  }

  async componentDidMount() {
    const query = new URLSearchParams(this.props.location.search)
    const searchQuery = query.get('q')
    if (searchQuery) {
      await this.setSearch(searchQuery, true)
    }
  }

  async setSearch(search, skipDebounce = false) {
    this.setState({ search, searchActive: true })

    if (this.state.searchDebounce) {
      clearTimeout(this.state.searchDebounce)
    }

    if (search === '') {
      this.props.onSearch('', this.state.sort || '')
      return
    }

    const timeout = setTimeout(
      async () => {
        this.setState({ searchDebounce: undefined, listState: 'search' })
        this.props.history.push(`/search/?q=${this.state.search.trim()}&sort=${this.state.sort || ''}`)
        // TODO: cancel this request if new one is requested
        await this.props.onSearch(this.state.search, this.state.sort)
      },
      skipDebounce ? 0 : 1000
    )
    this.setState({ searchDebounce: timeout })
  }

  componentDidUpdate({ search: prevSearch, location: { pathname: prevPath } }, { search: prevStateSearch }) {
    const newPath = this.props.location.pathname
    if (prevPath !== newPath && !newPath.startsWith('/search')) {
      this.setState({ searchActive: false, search: '' })
    }

    if (this.props.search !== prevSearch && this.props.search !== this.state.search) {
      this.setState({ searchActive: true, search: this.props.search })
    }
    if (prevStateSearch !== this.state.search) {
      this.setSearch(this.state.search)
    }
  }

  getNotificationSubscriptions() {
    return this.props.notifications.filter(R.propEq('text', this.state.search?.toLocaleLowerCase()))
  }

  render() {
    const notificationSubscriptions = this.getNotificationSubscriptions()
    const subscribed = notificationSubscriptions.length > 0
    const notificationSubscriptionDisabled =
      this.state.search === '' || this.state.modifyingNotification || !this.props.emailVerified
    const notificationSubscriptionLoading = this.state.modifyingNotification

    return (
      <div className="top_bar">
        <div className="top_bar_contents">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} className="menu_left">
            <Popup
              anchor={
                <MenuNavButton disabled={true} to={'/tracks'} label="Discover" icon={<FontAwesomeIcon icon="play" />} />
              }
              open={this.state.discoverMenuOpen}
              onOpenChanged={open => this.setState({ discoverMenuOpen: open })}
              popupClassName={'popup_content-right'}
            >
              <div style={{ flexDirection: 'column', display: 'flex', minWidth: 250 }}>
                <NavLink
                  style={isActive => ({ opacity: isActive ? 1 : 0.7 })}
                  to={'/tracks/new'}
                  className={'pill pill-button button-push_button-small'}
                  onClick={() => this.setState({ discoverMenuOpen: false })}
                >
                  <span className={'pill-button-contents button-push_button_label'}>New tracks</span>
                </NavLink>
                <NavLink
                  style={isActive => ({ opacity: isActive ? 1 : 0.7 })}
                  to={'/tracks/recent'}
                  className={'pill pill-button button-push_button-small'}
                  onClick={() => this.setState({ discoverMenuOpen: false })}
                >
                  <span className={'pill-button-contents button-push_button_label'}>Recently added</span>
                </NavLink>
                <NavLink
                  style={isActive => ({ opacity: isActive ? 1 : 0.7 })}
                  to={'/tracks/heard'}
                  className={'pill pill-button button-push_button-small'}
                  onClick={() => this.setState({ discoverMenuOpen: false })}
                >
                  <span className={'pill-button-contents button-push_button_label'}>Recently played</span>
                </NavLink>
              </div>
            </Popup>
            <MenuNavButton
              to={'/carts/'}
              disabled={!this.props.carts}
              label="Carts"
              icon={<FontAwesomeIcon icon="cart-shopping" />}
            />
          </div>
          <div
            style={{ display: 'flex', gap: 8, alignItems: 'center' }}
            className={`menu_search ${this.state.searchActive ? 'menu_search-active' : ''}`}
          >
            <SearchBar
              onChange={e => this.setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.code === 'Enter') {
                  return this.props.triggerSearch()
                }
              }}
              value={this.state.searchActive ? this.state.search : ''}
              onClearSearch={() => this.setSearch('')}
              styles="top_bar"
            />
            {this.state.searchActive && (
              <span
                className={`subscribe_button popup_container ${
                  !this.props.userSettings.emailVerified ? 'email_not_verified' : ''
                }`}
                style={{ whiteSpace: 'nowrap' }}
              >
                <DropDownButton
                  size={'top_bar'}
                  onClick={async e => {
                    e.stopPropagation()
                    this.setState({ modifyingNotification: true })
                    await this.props.handleToggleNotificationClick(this.state.search, !subscribed)
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
                          onClick={async e => {
                            e.stopPropagation()
                            try {
                              this.setState({ modifyingNotification: true })
                              await this.props.handleToggleNotificationClick(this.state.search, !isSubscribed, [
                                storeName
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
            )}
            {!this.props.userSettings.emailVerified && !this.state.emailVerificationDismissed && (
              <div
                style={{
                  padding: '0 8px 0 4px',
                  height: '100%',
                  flex: 0
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
          </div>
          <div style={{ alignItems: 'center' }} className="menu_right">
            <Popup
              open={this.state.supportMenuOpen}
              onOpenChanged={open => this.setState({ supportMenuOpen: open })}
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
                  onMouseLeave={() => {
                    if (!Onboarding.active) {
                      this.setState({ supportMenuOpen: false })
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
                  className="button button-push_button button-push_button-small button-push_button-primary"
                  onClick={() => {
                    this.props.history.push('/new')
                    this.props.onOnboardingButtonClicked()
                  }}
                >
                  <FontAwesomeIcon icon="circle-question" onClick={this.props.onHelpButtonClicked} /> Show Tutorial
                </button>
                {!isMobile && (
                  <button
                    onClick={this.props.onKeyboardShortcutsClicked}
                    className="button button-push_button button-push_button-small button-push_button-primary"
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
