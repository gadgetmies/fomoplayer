import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { Component } from 'react'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials'
import SpinnerButton from './SpinnerButton'
import Spinner from './Spinner'
import ToggleButton from './ToggleButton'
import CopyToClipboardButton from './CopyToClipboardButton'
import config from './config.js'
import * as R from 'ramda'
import PillButton from './PillButton'

class Settings extends Component {
  unlockMarkAllHeard() {
    this.setState({ markAllHeardUnlocked: true })
  }

  markHeardButton = (label, interval) => (
    <SpinnerButton
      disabled={!this.state.markAllHeardUnlocked || this.state.markingHeard !== null}
      loading={this.state.markingHeard === interval}
      onClick={async () => {
        this.setState({ markingHeard: interval })
        await this.props.onMarkHeardClicked(interval)
        this.setState({ markingHeard: null })
      }}
      label={label}
      loadingLabel={'Marking heard'}
    />
  )

  constructor(props) {
    super(props)
    this.state = {
      followQuery: '',
      artistFollows: [],
      labelFollows: [],
      playlistFollows: [],
      artistOnLabelIgnores: [],
      artistIgnores: [],
      labelIgnores: [],
      notifications: this.props.notifications,
      notificationSearch: '',
      cartName: '',
      email: props.userSettings.email || '',
      updatingEmail: false,
      emailVerificationRequested: false,
      emailVerificationFailed: false,
      updatingFollows: false,
      updatingFollowDetails: false,
      updatingCarts: false,
      updatingArtistOnLabelIgnores: false,
      updatingArtistIgnores: false,
      updatingLabelIgnores: false,
      updatingNotifications: false,
      addingCart: false,
      removingCart: false,
      followDetailsDebounce: undefined,
      followDetails: undefined,
      followDetailsUpdateAborted: false,
      markAllHeardUnlocked: false,
      markingHeard: null,
      settingCartPublic: null,
      publicCarts: new Set(props.carts.filter(R.prop('is_public')).map(R.prop('id'))),
      page: 'following'
    }

    this.markHeardButton.bind(this)
  }

  async componentDidMount() {
    try {
      await Promise.all([this.updateFollows(), this.updateIgnores()])
    } catch (e) {
      console.error(e)
    }

    this.setState({ loading: false })
  }

  async updateFollows() {
    await this.updateArtistFollows()
    await this.updateLabelFollows()
    await this.updatePlaylistFollows()
  }

  async updateArtistFollows() {
    const artistFollows = await requestJSONwithCredentials({
      path: `/me/follows/artists`
    })

    this.setState({ artistFollows })
  }

  async updateLabelFollows() {
    const labelFollows = await requestJSONwithCredentials({
      path: `/me/follows/labels`
    })
    this.setState({ labelFollows })
  }

  async updatePlaylistFollows() {
    const playlistFollows = await requestJSONwithCredentials({
      path: `/me/follows/playlists`
    })
    this.setState({ playlistFollows })
  }

  async updateIgnores() {
    await Promise.all([this.updateArtistIgnores(), this.updateLabelIgnores(), this.updateArtistOnLabelIgnores()])
  }

  async updateArtistIgnores() {
    const artistIgnores = await requestJSONwithCredentials({
      path: `/me/ignores/artists`
    })
    this.setState({ artistIgnores })
  }

  async updateLabelIgnores() {
    const labelIgnores = await requestJSONwithCredentials({
      path: `/me/ignores/labels`
    })
    this.setState({ labelIgnores })
  }

  async updateArtistOnLabelIgnores() {
    const artistOnLabelIgnores = await requestJSONwithCredentials({
      path: `/me/ignores/artists-on-labels`
    })
    this.setState({ artistOnLabelIgnores })
  }

  async setCartSharing(cartId, setPublic) {
    this.setState({ settingCartPublic: cartId, updatingCarts: true })
    await requestWithCredentials({
      path: `/me/carts/${cartId}`,
      method: 'POST',
      body: {
        is_public: setPublic
      }
    })
    const updatedPublicCarts = new Set(this.state.publicCarts)
    setPublic ? updatedPublicCarts.add(cartId) : updatedPublicCarts.delete(cartId)
    this.setState({ settingCartPublic: null, updatingCarts: false, publicCarts: updatedPublicCarts })
  }

  onShowPage(page) {
    this.setState({ page })
  }

  render() {
    return (
      <div className="page-container scroll-container settings-container">
        <div>
          <h2>Settings</h2>
          <p>
            <div
              className="state-select-button state-select-button--container noselect"
              style={{ display: 'inline-block', flex: 0 }}
            >
              <input
                type="radio"
                id="settings-state-following"
                name="settings-state"
                defaultChecked={true}
                onChange={() => this.onShowPage('following')}
              />
              <label className="state-select-button--button" htmlFor="settings-state-following">
                Following
              </label>
              <input
                type="radio"
                id="settings-state-carts"
                name="settings-state"
                onChange={() => this.onShowPage('carts')}
              />
              <label className="state-select-button--button" htmlFor="settings-state-carts">
                Carts
              </label>
              <input
                type="radio"
                id="settings-state-notifications"
                name="settings-state"
                defaultChecked={this.state.page === 'notifications'}
                onChange={() => this.onShowPage('notifications')}
              />
              <label className="state-select-button--button" htmlFor="settings-state-notifications">
                Notifications
              </label>
              <input
                type="radio"
                id="settings-state-ignores"
                name="settings-state"
                defaultChecked={this.state.page === 'ignores'}
                onChange={() => this.onShowPage('ignores')}
              />
              <label className="state-select-button--button" htmlFor="settings-state-ignores">
                Ignores
              </label>
              <input
                type="radio"
                id="settings-state-collection"
                name="settings-state"
                defaultChecked={this.state.page === 'collection'}
                onChange={() => this.onShowPage('collection')}
              />
              <label className="state-select-button--button" htmlFor="settings-state-collection">
                Collection
              </label>
            </div>
          </p>
          {this.state.page === 'following' ? (
            <>
              <label>
                <h4>Search by name or URL to follow:</h4>
                <div className="input-layout">
                  <input
                    className="text-input text-input-small"
                    disabled={this.state.updatingFollows}
                    value={this.state.followQuery}
                    onChange={e => {
                      // TODO: replace aborted and debounce with flatmapLatest
                      this.setState({
                        followQuery: e.target.value,
                        followDetails: undefined,
                        updatingFollowDetails: false
                      })
                      if (this.state.followDetailsDebounce) {
                        clearTimeout(this.state.followDetailsDebounce)
                        this.setState({
                          followDetailsDebounce: undefined,
                          followDetailsUpdateAborted: this.state.followDetailsDebounce !== undefined
                        })
                      }

                      if (e.target.value === '') {
                        return
                      }
                      this.setState({ updatingFollowDetails: true, followDetailsUpdateAborted: false })
                      const timeout = setTimeout(async () => {
                        try {
                          const results = await (
                            await requestWithCredentials({ path: `/followDetails?q=${this.state.followQuery}` })
                          ).json()
                          if (this.state.followDetailsUpdateAborted) return
                          this.setState({ followDetails: results, updatingFollowDetails: false })
                        } catch (e) {
                          console.error('Error updating follow details', e)
                          clearTimeout(this.state.followDetailsDebounce)
                          this.setState({
                            updatingFollowDetails: false,
                            followDetailsDebounce: undefined
                          })
                        }
                      }, 500)
                      this.setState({ followDetailsDebounce: timeout })
                    }}
                  />
                </div>
                <br />
                {this.state.updatingFollowDetails ? (
                  <Spinner size="large" />
                ) : this.state.followDetails === undefined ? null : this.state.followDetails.length === 0 ? (
                  'No results found'
                ) : (
                  <div className={'input-layout'}>
                    {this.state.followDetails.map(details => (
                      <SpinnerButton
                        className="button button-push_button-small button-push_button-primary"
                        disabled={this.state.updatingFollows}
                        loading={this.state.updatingFollows}
                        onClick={async () => {
                          this.setState({ updatingFollows: true })
                          const props = details.id
                            ? {
                                headers: {
                                  'content-type': `application/vnd.multi-store-player.${details.type}-ids+json`
                                },
                                body: [details.id]
                              }
                            : {
                                body: [{ url: this.state.followQuery }]
                              }

                          await requestJSONwithCredentials({
                            path: `/me/follows/${details.type}s`,
                            method: 'POST',
                            ...props
                          })
                          this.setState({ followQuery: '', followDetails: undefined })
                          await this.updateFollows()
                          this.setState({ updatingFollows: false })
                        }}
                      >
                        <FontAwesomeIcon icon="plus" /> Follow {details.type}:{' '}
                        <span class="pill" style={{ backgroundColor: 'white', color: 'black' }}>
                          {details.stores.map(store => (
                            <span aria-hidden="true" className={`store-icon store-icon-${store}`}></span>
                          ))}{' '}
                          {details.label}
                        </span>
                      </SpinnerButton>
                    ))}
                  </div>
                )}
              </label>
              <h4>Artists ({this.state.artistFollows.length})</h4>
              <ul className="no-style-list follow-list">
                {this.state.artistFollows.map(artist => (
                  <li>
                    <span className="button pill pill-button">
                      <span className="pill-button-contents">
                        {artist.stores.map(({ name: storeName }) => (
                          <>
                            <span aria-hidden="true" className={`store-icon store-icon-${storeName.toLowerCase()}`} />{' '}
                          </>
                        ))}
                        {artist.name}{' '}
                        <button
                          disabled={this.state.updatingArtistFollows}
                          onClick={async () => {
                            this.setState({ updatingArtistFollows: true })
                            await requestWithCredentials({ path: `/me/follows/artists/${artist.id}`, method: 'DELETE' })
                            await this.updateArtistFollows()
                            this.setState({ updatingArtistFollows: false })
                          }}
                        >
                          <FontAwesomeIcon icon="times-circle" />
                        </button>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <h4>Labels ({this.state.labelFollows.length})</h4>
              <ul className="no-style-list follow-list">
                {this.state.labelFollows.map(label => (
                  <li>
                    <span className="button pill pill-button">
                      <span className="pill-button-contents">
                        {label.stores.map(({ name: storeName }) => (
                          <>
                            <span
                              aria-hidden="true"
                              className={`store-icon store-icon-${storeName.toLowerCase()}`}
                            ></span>{' '}
                          </>
                        ))}
                        {label.name}{' '}
                        <button
                          disabled={this.state.updatingLabelFollows}
                          onClick={async () => {
                            this.setState({ updatingLabelFollows: true })
                            await requestWithCredentials({ path: `/me/follows/labels/${label.id}`, method: 'DELETE' })
                            await this.updateLabelFollows()
                            this.setState({ updatingLabelFollows: false })
                          }}
                        >
                          <FontAwesomeIcon icon="times-circle" />
                        </button>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <h4>Playlists ({this.state.playlistFollows.length})</h4>
              <ul className="no-style-list follow-list">
                {this.state.playlistFollows.map(playlist => (
                  <li>
                    <span key={playlist.id} className="button pill pill-button">
                      <span className="pill-button-contents">
                        <span
                          aria-hidden="true"
                          className={`store-icon store-icon-${playlist.storeName.toLowerCase()}`}
                        />{' '}
                        {playlist.title}{' '}
                        <button
                          disabled={this.state.updatingPlaylistFollows}
                          onClick={async () => {
                            this.setState({ updatingPlaylistFollows: true })
                            await requestWithCredentials({
                              path: `/me/follows/playlists/${playlist.id}`,
                              method: 'DELETE'
                            })
                            await this.updatePlaylistFollows()
                            this.setState({ updatingPlaylistFollows: false })
                          }}
                        >
                          <FontAwesomeIcon icon="times-circle" />
                        </button>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {this.state.page === 'carts' ? (
            <>
              <label>
                <h4>Create cart:</h4>
                <div className="input-layout">
                  <input
                    className="text-input text-input-small"
                    disabled={this.state.updatingCarts}
                    value={this.state.cartName}
                    onChange={e => this.setState({ cartName: e.target.value })}
                  />
                  <SpinnerButton
                    className="button button-push_button-small button-push_button-primary"
                    loading={this.state.addingCart}
                    disabled={this.state.cartName === '' || this.state.addingCart || this.state.updatingCarts}
                    label="Add"
                    loadingLabel="Adding"
                    onClick={async () => {
                      this.setState({ updatingCarts: true, addingCart: true })
                      try {
                        await requestJSONwithCredentials({
                          path: `/me/carts`,
                          method: 'POST',
                          body: { name: this.state.cartName }
                        })
                        this.setState({ cartName: '' })
                        await this.props.onUpdateCarts()
                      } catch (e) {
                        console.error(e)
                      }
                      this.setState({ updatingCarts: false, addingCart: false })
                    }}
                  />
                </div>
              </label>
              <p>
                {this.props.carts.map(cart => {
                  const buttonId = `sharing-${cart.id}`
                  const publicLink = new URL(`/cart/${cart.uuid}`, window.location).toString()
                  return (
                    <>
                      <h4>{cart.name}</h4>
                      <p>
                        <div style={{ display: 'flex', alignItems: 'center' }} className="input-layout">
                          <label htmlFor={buttonId} className="noselect">
                            Sharing enabled:
                          </label>
                          <ToggleButton
                            id={buttonId}
                            checked={cart.is_public}
                            disabled={this.state.settingCartPublic !== null || this.state.updatingCarts}
                            onChange={state => this.setCartSharing(cart.id, state)}
                          />
                          {this.state.settingCartPublic === cart.id ? <Spinner size="small" /> : null}
                        </div>
                        <br />
                        {this.state.publicCarts.has(cart.id) ? (
                          <div style={{ display: 'flex', alignItems: 'center' }} className="input-layout">
                            <span>URL:</span>
                            <a href={publicLink} className="link" target="_blank">
                              {publicLink}
                            </a>
                            <CopyToClipboardButton content={publicLink} />
                          </div>
                        ) : null}
                      </p>
                      {cart.is_default ? null : (
                        <p>
                          <SpinnerButton
                            loading={this.state.deletingCart}
                            className={`button button-push_button-small button-push_button-primary`}
                            disabled={this.state.addingCart || this.state.updatingCarts || this.state.deletingCart}
                            onClick={async () => {
                              this.setState({ deletingCart: cart.id, updatingCarts: true })
                              await requestWithCredentials({ path: `/me/carts/${cart.id}`, method: 'DELETE' })
                              await this.props.onUpdateCarts()
                              this.setState({ deletingCart: null, updatingCarts: false })
                            }}
                          >
                            Delete cart "{cart.name}"
                          </SpinnerButton>
                        </p>
                      )}
                    </>
                  )
                })}
              </p>
            </>
          ) : null}
          {this.state.page === 'notifications' ? (
            <>
              <label>
                <h4>Email address:</h4>
                <div className="input-layout">
                  <input
                    type={'email'}
                    className="text-input text-input-small"
                    value={this.state.email}
                    onChange={e => this.setState({ email: e.target.value, emailVerificationRequested: false })}
                  />
                  <SpinnerButton
                    className="button button-push_button-small button-push_button-primary"
                    disabled={
                      this.state.updatingEmail ||
                      (this.props.userSettings.email === this.state.email && this.props.userSettings.emailVerified) ||
                      this.state.email === ''
                    }
                    loading={this.state.updatingEmail}
                    onClick={async () => {
                      this.setState({
                        updatingEmail: true,
                        emailVerificationRequested: true,
                        emailVerificationFailed: false
                      })
                      try {
                        await this.props.onUpdateEmail(this.state.email)
                      } catch (e) {
                        this.setState({ emailVerificationFailed: true })
                      } finally {
                        this.setState({ updatingEmail: false })
                      }
                    }}
                  >
                    {this.state.emailVerificationFailed ||
                    (!this.props.userSettings.emailVerified &&
                      this.props.userSettings.email !== null &&
                      this.props.userSettings.email === this.state.email)
                      ? 'Resend verification'
                      : 'Update'}
                  </SpinnerButton>
                </div>
                {this.state.emailVerificationFailed ? (
                  <p>Request failed, please try again.</p>
                ) : !this.state.updatingEmail &&
                  (this.state.emailVerificationRequested ||
                    (!this.props.userSettings.emailVerified &&
                      this.props.userSettings.email !== null &&
                      this.props.userSettings.email === this.state.email)) ? (
                  <p>
                    {this.state.emailVerificationRequested ? 'Verification email sent.' : ''} Please verify your email
                    address to receive notifications.
                  </p>
                ) : null}
                <h4>Get notifications for search:</h4>
                <div className="input-layout">
                  <input
                    className="text-input text-input-small"
                    disabled={this.state.updatingNotifications}
                    value={this.state.notificationSearch}
                    onChange={e => {
                      this.setState({ notificationSearch: e.target.value })
                    }}
                  />
                  <SpinnerButton
                    className="button button-push_button-small button-push_button-primary"
                    disabled={this.state.updatingNotifications}
                    loading={this.state.updatingNotifications}
                    onClick={async () => {
                      await this.props.onRequestNotification(this.state.notificationSearch)
                      this.setState({ notificationSearch: '' })
                    }}
                  >
                    <FontAwesomeIcon icon="bell" /> Subscribe
                  </SpinnerButton>
                </div>
              </label>
              <h4>Search notification subscriptions</h4>
              <ul className="no-style-list follow-list">
                {this.props.notifications.map(notification => (
                  <li key={notification.id}>
                    <PillButton
                      disabled={this.state.updatingNotifications}
                      onClick={async () => {
                        this.setState({ updatingNotifications: true })
                        await this.props.onRemoveNotification(notification.id)
                        this.setState({ updatingNotifications: false })
                      }}
                    >
                      {notification.text} <FontAwesomeIcon icon="bell-slash" />
                    </PillButton>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {this.state.page === 'ignores' ? (
            <>
              <h4>Artists ({this.state.artistIgnores.length})</h4>
              <ul className="no-style-list follow-list">
                {this.state.artistIgnores.map(artist => (
                  <li key={artist.id}>
                    <span className="button pill pill-button">
                      <span className="pill-button-contents">
                        {artist.name}{' '}
                        <button
                          disabled={this.state.updatingArtistIgnores}
                          onClick={async () => {
                            this.setState({ updatingArtistIgnores: true })
                            await requestWithCredentials({ path: `/me/ignores/artists/${artist.id}`, method: 'DELETE' })
                            await this.updateArtistIgnores()
                            this.setState({ updatingArtistIgnores: false })
                          }}
                        >
                          <FontAwesomeIcon icon="times-circle" />
                        </button>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <h4>Labels ({this.state.labelIgnores.length})</h4>
              <ul className="no-style-list follow-list">
                {this.state.labelIgnores.map(label => (
                  <li key={label.id}>
                    <span className="button pill pill-button">
                      <span className="pill-button-contents">
                        {label.name}{' '}
                        <button
                          disabled={this.state.updatingLabelIgnores}
                          onClick={async () => {
                            this.setState({ updatingLabelIgnores: true })
                            await requestWithCredentials({ path: `/me/ignores/labels/${label.id}`, method: 'DELETE' })
                            await this.updateLabelIgnores()
                            this.setState({ updatingLabelIgnores: false })
                          }}
                        >
                          <FontAwesomeIcon icon="times-circle" />
                        </button>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <h4>Artists on labels ({this.state.artistOnLabelIgnores.length})</h4>
              <ul className="no-style-list follow-list">
                {this.state.artistOnLabelIgnores.map(({ artist, label }) => (
                  <li key={`${artist.id}-${label.id}`}>
                    <span className="button pill pill-button">
                      <span className="pill-button-contents">
                        {artist.name} on ${label.name}
                        <button
                          disabled={this.state.updatingArtistOnLabelIgnores}
                          onClick={async () => {
                            this.setState({ updatingArtistOnLabelIgnores: true })
                            await requestWithCredentials({
                              path: `/me/ignores/artists-on-labels/`,
                              method: 'PATCH',
                              body: { op: 'delete', artistId: artist.id, labelId: label.id }
                            })
                            await this.updateArtistOnLabelIgnores()
                            this.setState({ updatingArtistOnLabelIgnores: false })
                          }}
                        >
                          <FontAwesomeIcon icon="times-circle" />
                        </button>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {this.state.page === 'collection' ? (
            <>
              <p>
                New tracks: {this.props.newTracks}
                <br />
                Total: {this.props.totalTracks}
                <br />
              </p>
              <h4>Mark tracks heard</h4>
              <p>
                Danger zone! This action cannot be undone!
                <br />
              </p>
              <p>
                <button
                  type="submit"
                  disabled={this.state.markAllHeardUnlocked}
                  className={`button button-push_button-small button-push_button-primary`}
                  style={this.props.style}
                  onClick={this.unlockMarkAllHeard.bind(this)}
                >
                  Enable buttons
                </button>
              </p>
              <p className="input-layout">
                {this.markHeardButton('Older than a month', '1 months')}
                {this.markHeardButton('Older than two months', '2 months')}
                {this.markHeardButton('Older than half a year', '6 months')}
                {this.markHeardButton('Older than one year', '1 years')}
                {this.markHeardButton('Older than two years', '2 years')}
              </p>
              <p className="input-layout">{this.markHeardButton('All tracks', '0')}</p>
            </>
          ) : null}
        </div>
      </div>
    )
  }
}

export default Settings
