import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { solid, regular, brands, icon } from '@fortawesome/fontawesome-svg-core/import.macro'
import React, { Component } from 'react'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials'
import SpinnerButton from './SpinnerButton'
import Spinner from './Spinner'
import ToggleButton from './ToggleButton'
import CopyToClipboardButton from './CopyToClipboardButton'
import * as R from 'ramda'
import scoreWeightDetails from './scoreWeights'
import Tracks from './Tracks'
import FollowItemButton from './FollowItemButton'
import { Link } from 'react-router-dom'

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

    const urlSearchParams = new URLSearchParams(window.location.search)
    const params = Object.fromEntries(urlSearchParams.entries())
    const { page } = params

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
      updatingFollowWithUrl: null,
      updatingFollowDetails: null,
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
      scoreWeightsDebounce: undefined,
      markAllHeardUnlocked: false,
      markingHeard: null,
      settingCartPublic: null,
      publicCarts: new Set(props.carts.filter(R.prop('is_public')).map(R.prop('id'))),
      page: page || 'following',
      scoreWeights: this.props.scoreWeights,
      tracks: this.props.tracks
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

  async setScoreWeight(property, value) {
    const newWeights = structuredClone(this.state.scoreWeights)
    newWeights.find(({ property: p }) => p === property).weight = value
    this.setState({ scoreWeights: newWeights })

    if (this.state.scoreWeightsDebounce) {
      clearTimeout(this.state.scoreWeightsDebounce)
      this.setState({
        scoreWeightsDebounce: undefined
      })
    }

    const timeout = setTimeout(async () => {
      await requestWithCredentials({
        path: `/me/score-weights`,
        method: 'POST',
        body: newWeights
      })

      try {
        this.setState({ updatingTracks: true })

        const { tracks } = await requestJSONwithCredentials({
          path: `/me/tracks?limit_new=10&limit_recent=0&limit_heard=0`
        })

        this.setState({ tracks, updatingTracks: false })
      } catch (e) {
        console.error(e)
        this.setState({ updatingTracks: false })
      }
    }, 500)

    this.setState({ scoreWeightsDebounce: timeout })
  }

  renderWeightInputs({ property, weight }) {
    const weightDetails = scoreWeightDetails[property]
    const numberProps = { min: weightDetails.min, max: weightDetails.max, step: weightDetails.step }
    const scaling = weightDetails.isPenalty ? -1 : 1
    const scaledWeight = scaling * weight
    return (
      <div style={{ display: 'table-row', margin: 5 }} key={property} className={'input-layout'}>
        <label
          style={{ display: 'table-cell', fontSize: '90%', verticalAlign: 'middle' }}
          htmlFor={`weights-${property}`}
        >
          {weightDetails.label}
        </label>
        <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
          <input
            id={`weights-${property}`}
            type="range"
            style={{
              display: 'table-cell',
              backgroundSize: `${(scaledWeight / (numberProps.max - numberProps.min)) * 100}% 100%`
            }}
            value={scaledWeight}
            onChange={e => this.setScoreWeight(property, Number(e.target.value) * scaling)}
            {...numberProps}
          />
        </div>
        <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
          <input
            type="number"
            value={scaledWeight}
            onChange={e => this.setScoreWeight(property, Number(e.target.value) * scaling)}
            style={{ display: 'table-cell' }}
            className={'text-input text-input-small text-input-dark '}
            {...numberProps}
          />
        </div>
        <div style={{ display: 'table-cell', fontSize: '60%', verticalAlign: 'middle' }}>
          <div style={{ marginLeft: 6 }}>{weightDetails.unit}</div>
        </div>
      </div>
    )
  }

  render() {
    return (
      <div className="page-container scroll-container" style={{ ...this.props.style }}>
        <div className="settings-container">
          <h2>Settings</h2>
          <div>
            <div className="select-button select-button--container state-select-button--container noselect">
              <input
                type="radio"
                id="settings-state-following"
                name="settings-state"
                checked={this.state.page === 'following'}
                onChange={() => this.onShowPage('following')}
              />
              <label className="select-button--button" htmlFor="settings-state-following">
                Following
              </label>
              <input
                type="radio"
                id="settings-state-sorting"
                name="settings-state"
                checked={this.state.page === 'sorting'}
                onChange={() => this.onShowPage('sorting')}
              />
              <label className="select-button--button" htmlFor="settings-state-sorting">
                Sorting
              </label>
              <input
                type="radio"
                id="settings-state-carts"
                name="settings-state"
                checked={this.state.page === 'carts'}
                onChange={() => this.onShowPage('carts')}
              />
              <label className="select-button--button" htmlFor="settings-state-carts">
                Carts
              </label>
              <input
                type="radio"
                id="settings-state-notifications"
                name="settings-state"
                checked={this.state.page === 'notifications'}
                onChange={() => this.onShowPage('notifications')}
              />
              <label className="select-button--button" htmlFor="settings-state-notifications">
                Notifications
              </label>
              <input
                type="radio"
                id="settings-state-ignores"
                name="settings-state"
                checked={this.state.page === 'ignores'}
                onChange={() => this.onShowPage('ignores')}
              />
              <label className="select-button--button" htmlFor="settings-state-ignores">
                Ignores
              </label>
              <input
                type="radio"
                id="settings-state-collection"
                name="settings-state"
                checked={this.state.page === 'collection'}
                onChange={() => this.onShowPage('collection')}
              />
              <label className="select-button--button" htmlFor="settings-state-collection">
                Collection
              </label>
            </div>
          </div>
          {this.state.page === 'following' ? (
            <>
              <label>
                <h4>Search by name or URL to follow:</h4>
                <div className="input-layout">
                  <label className="search-bar">
                    <input
                      className="text-input text-input-large text-input-dark search"
                      disabled={this.state.updatingFollowWithUrl !== null}
                      value={this.state.followQuery}
                      onChange={e => {
                        // TODO: replace aborted and debounce with flatmapLatest
                        this.setState({
                          followQuery: e.target.value,
                          followDetails: undefined,
                          updatingFollowDetails: null
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
                        this.setState({
                          updatingFollowDetails: Object.fromEntries(
                            this.props.stores.map(({ storeName }) => [storeName, true])
                          ),
                          followDetailsUpdateAborted: false
                        })
                        const timeout = setTimeout(async () => {
                          if (this.state.followQuery.match('^https://')) {
                            try {
                              const results = await (
                                await requestWithCredentials({ path: `/followDetails?q=${this.state.followQuery}` })
                              ).json()
                              if (this.state.followDetailsUpdateAborted) return
                              this.setState({ followDetails: results, updatingFollowDetails: null })
                            } catch (e) {
                              console.error('Error updating follow details', e)
                              clearTimeout(this.state.followDetailsDebounce)
                              this.setState({
                                updatingFollowDetails: null,
                                followDetailsDebounce: undefined
                              })
                            }
                          } else {
                            const promises = this.props.stores.map(({ storeName }) =>
                              requestWithCredentials({ path: `/stores/${store}/search/?q=${this.state.followQuery}` })
                                .then(async res =>
                                  (await res.json()).map(result => ({ stores: [storeName], ...result }))
                                )
                                .then(json => {
                                  if (this.state.followDetailsUpdateAborted) return
                                  this.setState({
                                    followDetails:
                                      this.state.followDetails === undefined
                                        ? json
                                        : R.sortBy(
                                            R.compose(R.toLower, R.prop('name')),
                                            this.state.followDetails.concat(json)
                                          ),
                                    updatingFollowDetails: { ...this.state.updatingFollowDetails, [storeName]: false }
                                  })
                                })
                            )
                            Promise.all(promises).catch(e => {
                              console.error('Error updating follow details', e)
                              clearTimeout(this.state.followDetailsDebounce)
                              this.setState({
                                updatingFollowDetails: null,
                                followDetailsDebounce: undefined
                              })
                            })
                          }
                        }, 500)
                        this.setState({ followDetailsDebounce: timeout })
                      }}
                    />
                    {this.state.followQuery ? (
                      <FontAwesomeIcon
                        onClick={() =>
                          this.setState({
                            followQuery: '',
                            updatingFollowDetails: null,
                            followDetails: undefined,
                            updatingFollowWithUrl: null
                          })
                        }
                        className={'search-input-icon clear-search'}
                        icon="times-circle"
                      />
                    ) : (
                      <FontAwesomeIcon className={'search-input-icon'} icon="search" />
                    )}
                  </label>
                </div>
                {this.state.updatingFollowDetails !== null &&
                Object.values(this.state.updatingFollowDetails).some(val => val) ? (
                  <>
                    <br />
                    Searching <Spinner size="large" />
                  </>
                ) : this.state.followDetails === undefined ? null : (
                  <>
                    {this.state.followDetails.length === 0 ? (
                      'No results found'
                    ) : (
                      <div>
                        {R.sortBy(R.prop(0), Object.entries(R.groupBy(R.prop('type'), this.state.followDetails))).map(
                          ([type, items]) => (
                            <>
                              <h5>
                                {type[0].toLocaleUpperCase()}
                                {type.substring(1)}s
                              </h5>
                              {R.sortBy(
                                R.prop(0),
                                Object.entries(
                                  R.groupBy(
                                    R.propSatisfies(
                                      name => name.toLocaleLowerCase() !== this.state.followQuery.toLocaleLowerCase(),
                                      'name'
                                    ),
                                    items
                                  )
                                )
                              ).map(([isNotExactMatch, grouped]) => (
                                <>
                                  {type !== 'playlist' && (
                                    <h6>{isNotExactMatch === 'true' ? 'Related:' : 'Exact matches:'}</h6>
                                  )}
                                  <ul className={'no-style-list follow-list'}>
                                    {grouped.map(({ id, name, store: { name: storeName }, type, url, img }) => (
                                      <li key={this.props.id}>
                                        <FollowItemButton
                                          id={id}
                                          name={name}
                                          storeName={storeName}
                                          type={type}
                                          url={url}
                                          img={img}
                                          disabled={this.getFollowItemDisabled(type, url)}
                                          loading={this.state.updatingFollowWithUrl === url}
                                          onClick={(() => this.onFollowItemClick(url, type)).bind(this)}
                                        />
                                      </li>
                                    ))}
                                  </ul>
                                </>
                              ))}
                            </>
                          )
                        )}
                      </div>
                    )}
                  </>
                )}
              </label>
              <h4>Followed artists ({this.state.artistFollows.length})</h4>
              <ul className="no-style-list follow-list">
                {this.state.artistFollows.map(
                  ({ id, name, storeArtistId, store: { name: storeName, starred, watchId }, url }) => {
                    return (
                      <li key={storeArtistId}>
                        <span className="button pill pill-button">
                          <span className="pill-button-contents">
                            <>
                              <span aria-hidden="true" className={`store-icon store-icon-${storeName.toLowerCase()}`} />{' '}
                            </>
                            {name}{' '}
                            <button
                              disabled={this.state.updatingNotifications}
                              onClick={async e => {
                                e.stopPropagation()
                                this.setState({ updatingNotifications: true })
                                await this.props.onSetStarred('artists', watchId, !starred)
                                await this.updateArtistFollows()
                                this.setState({ updatingNotifications: false })
                              }}
                              title={`Star artist "${name}" on ${storeName}`}
                            >
                              {starred ? (
                                <FontAwesomeIcon icon={icon({ name: 'star', style: 'solid' })} />
                              ) : (
                                <FontAwesomeIcon icon={icon({ name: 'star', style: 'regular' })} />
                              )}
                            </button>{' '}
                            <button
                              disabled={this.state.updatingArtistFollows}
                              onClick={async () => {
                                this.setState({ updatingArtistFollows: true })
                                await requestWithCredentials({
                                  path: `/me/follows/artists/${storeArtistId}`,
                                  method: 'DELETE'
                                })
                                await this.updateArtistFollows()
                                this.setState({ updatingArtistFollows: false })
                              }}
                            >
                              <FontAwesomeIcon icon="times-circle" />{' '}
                              <a
                                href={url}
                                target="_blank"
                                onClick={e => e.stopPropagation()}
                                title={'Check details from store'}
                              >
                                <FontAwesomeIcon icon="external-link-alt" />
                              </a>
                            </button>
                          </span>
                        </span>
                      </li>
                    )
                  }
                )}
              </ul>
              <h4>Followed labels ({this.state.labelFollows.length})</h4>
              <ul className="no-style-list follow-list">
                {this.state.labelFollows.map(
                  ({ name, url, storeLabelId, store: { name: storeName, watchId, starred } }) => (
                    <li key={storeLabelId}>
                      <span className="button pill pill-button">
                        <span className="pill-button-contents">
                          <>
                            <span aria-hidden="true" className={`store-icon store-icon-${storeName.toLowerCase()}`} />{' '}
                          </>
                          {name}{' '}
                          <button
                            disabled={this.state.updatingNotifications}
                            onClick={async e => {
                              e.stopPropagation()
                              this.setState({ updatingNotifications: true })
                              await this.props.onSetStarred('labels', watchId, !starred)
                              await this.updateLabelFollows()
                              this.setState({ updatingNotifications: false })
                            }}
                            title={`Star label "${name}" on ${storeName}`}
                          >
                            {starred ? (
                              <FontAwesomeIcon icon={icon({ name: 'star', style: 'solid' })} />
                            ) : (
                              <FontAwesomeIcon icon={icon({ name: 'star', style: 'regular' })} />
                            )}
                          </button>{' '}
                          <button
                            disabled={this.state.updatingLabelFollows}
                            onClick={async () => {
                              this.setState({ updatingLabelFollows: true })
                              await requestWithCredentials({
                                path: `/me/follows/labels/${storeLabelId}`,
                                method: 'DELETE'
                              })
                              await this.updateLabelFollows()
                              this.setState({ updatingLabelFollows: false })
                            }}
                          >
                            <FontAwesomeIcon icon="times-circle" />{' '}
                            <a
                              href={url}
                              target="_blank"
                              onClick={e => e.stopPropagation()}
                              title={'Check details from store'}
                            >
                              <FontAwesomeIcon icon="external-link-alt" />
                            </a>
                          </button>
                        </span>
                      </span>
                    </li>
                  )
                )}
              </ul>
              <h4>Followed playlists ({this.state.playlistFollows.length})</h4>
              <ul className="no-style-list follow-list">
                {this.state.playlistFollows.map(({ id, storeName, title }) => (
                  <li key={id}>
                    <span key={id} className="button pill pill-button">
                      <span className="pill-button-contents">
                        <span aria-hidden="true" className={`store-icon store-icon-${storeName.toLowerCase()}`} />{' '}
                        {title}{' '}
                        <button
                          disabled={this.state.updatingPlaylistFollows}
                          onClick={async () => {
                            this.setState({ updatingPlaylistFollows: true })
                            await requestWithCredentials({
                              path: `/me/follows/playlists/${id}`,
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
          {this.state.page === 'sorting' ? (
            <>
              <p>
                The track list is sorted according to the following weights. The purpose of the weights is to higlight
                the most relevant releases.
              </p>
              <label>
                <h4>Weights:</h4>
                <h5>Bonuses:</h5>
                <div style={{ display: 'table' }}>
                  {this.state.scoreWeights
                    .filter(({ property }) => !scoreWeightDetails[property].isPenalty)
                    .map(this.renderWeightInputs.bind(this))}
                </div>
                <h5>Penalties:</h5>
                <div style={{ display: 'table' }}>
                  {this.state.scoreWeights
                    .filter(({ property }) => scoreWeightDetails[property].isPenalty)
                    .map(this.renderWeightInputs.bind(this))}
                </div>
              </label>
              <h5>Preview:</h5>
              <Tracks
                mode={'app'}
                tracks={this.state.tracks.new.slice(0, 10) || []}
                listState={'new'}
                notifications={[]}
                carts={[]}
                height={380}
                loading={this.state.updatingTracks}
                onPreviewRequested={() => {}}
                follows={this.props.follows}
              />
            </>
          ) : null}
          {this.state.page === 'carts' ? (
            <>
              <label>
                <h4>Create cart:</h4>
                <div className="input-layout">
                  <input
                    className="text-input text-input-large text-input-dark"
                    disabled={this.state.updatingCarts}
                    value={this.state.cartName}
                    onChange={e => this.setState({ cartName: e.target.value })}
                  />
                  <SpinnerButton
                    className="button button-push_button-large button-push_button-primary"
                    loading={this.state.addingCart}
                    disabled={this.state.cartName === '' || this.state.addingCart || this.state.updatingCarts}
                    label="Add"
                    loadingLabel="Adding"
                    onClick={async () => {
                      this.setState({ updatingCarts: true, addingCart: true })
                      try {
                        await this.props.onCreateCart(this.state.cartName)
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
              <div>
                {this.props.carts.map(({ id, is_default, is_public, is_purchased, name, uuid }) => {
                  const buttonId = `sharing-${id}`
                  const publicLink = new URL(`/cart/${uuid}`, window.location).toString()
                  return (
                    <div key={id}>
                      <h4>{name}</h4>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center' }} className="input-layout">
                          <label htmlFor={buttonId} className="noselect">
                            Sharing enabled:
                          </label>
                          <ToggleButton
                            id={buttonId}
                            checked={is_public}
                            disabled={this.state.settingCartPublic !== null || this.state.updatingCarts}
                            onChange={state => this.setCartSharing(id, state)}
                          />
                          {this.state.settingCartPublic === id ? <Spinner size="small" /> : null}
                        </div>
                        <br />
                        {this.state.publicCarts.has(id) ? (
                          <div style={{ display: 'flex', alignItems: 'center' }} className="input-layout">
                            <span>URL:</span>
                            <a href={publicLink} className="link" target="_blank">
                              {publicLink}
                            </a>
                            <CopyToClipboardButton content={publicLink} />
                          </div>
                        ) : null}
                      </div>
                      {is_default || is_purchased ? null : (
                        <p>
                          <SpinnerButton
                            loading={this.state.deletingCart}
                            className={`button button-push_button-small button-push_button-primary`}
                            disabled={this.state.addingCart || this.state.updatingCarts || this.state.deletingCart}
                            onClick={async () => {
                              this.setState({ deletingCart: id, updatingCarts: true })
                              await requestWithCredentials({ path: `/me/carts/${id}`, method: 'DELETE' })
                              await this.props.onUpdateCarts()
                              this.setState({ deletingCart: null, updatingCarts: false })
                            }}
                          >
                            Delete cart "{name}"
                          </SpinnerButton>
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          ) : null}
          {this.state.page === 'notifications' ? (
            <>
              <label>
                <h4>Email address:</h4>
                <div className="input-layout">
                  <input
                    type={'email'}
                    className="text-input text-input-large text-input-dark"
                    value={this.state.email}
                    onChange={e => this.setState({ email: e.target.value, emailVerificationRequested: false })}
                  />
                  <SpinnerButton
                    className="button button-push_button-large button-push_button-primary"
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
                    className="text-input text-input-large text-input-dark"
                    disabled={
                      this.state.updatingNotifications ||
                      this.state.updatingEmail ||
                      !this.props.userSettings.emailVerified
                    }
                    value={this.state.notificationSearch}
                    onChange={e => {
                      this.setState({ notificationSearch: e.target.value })
                    }}
                  />
                  <SpinnerButton
                    className="button button-push_button-large button-push_button-primary"
                    disabled={
                      this.state.updatingNotifications ||
                      this.state.updatingEmail ||
                      !this.props.userSettings.emailVerified
                    }
                    loading={this.state.updatingNotifications}
                    onClick={async () => {
                      await this.props.onRequestNotificationUpdate(
                        this.props.stores.map(({ storeName }) => ({
                          op: 'add',
                          storeName,
                          text: this.state.notificationSearch
                        }))
                      )
                      this.setState({ notificationSearch: '' })
                    }}
                  >
                    <FontAwesomeIcon icon="bell" /> Subscribe
                  </SpinnerButton>
                </div>
              </label>
              <h4>Search notification subscriptions</h4>
              <ul className="no-style-list follow-list">
                {this.props.notifications.map(({ id, text, storeName }) => (
                  <li key={id}>
                    <span className={'button pill pill-button'}>
                      <span className={'pill-button-contents'}>
                        <Link to={`/search/?q=${text}`} title={`Search for "${text}"`}>
                          {text}
                        </Link>{' '}
                        <button
                          disabled={this.state.updatingNotifications}
                          onClick={async e => {
                            e.stopPropagation()
                            this.setState({ updatingNotifications: true })
                            await this.props.onRequestNotificationUpdate([{
                              op: 'remove',
                              storeName,
                              text
                            }])

                            this.setState({ updatingNotifications: false })
                          }}
                          title={`Unsubscribe from "${text}"`}
                        >
                          <span aria-hidden="true" className={`store-icon store-icon-${storeName.toLowerCase()}`} />{' '}
                          <FontAwesomeIcon icon="times-circle" />
                        </button>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {this.state.page === 'ignores' ? (
            <>
              <h4>Artists ({this.state.artistIgnores.length})</h4>
              <ul className="no-style-list follow-list">
                {this.state.artistIgnores.map(({ name, id }) => (
                  <li key={id}>
                    <span className="button pill pill-button">
                      <span className="pill-button-contents">
                        {name}{' '}
                        <button
                          disabled={this.state.updatingArtistIgnores}
                          onClick={async () => {
                            this.setState({ updatingArtistIgnores: true })
                            await requestWithCredentials({
                              path: `/me/ignores/artists/${id}`,
                              method: 'DELETE'
                            })
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
                {this.state.labelIgnores.map(({ name, id }) => (
                  <li key={id}>
                    <span className="button pill pill-button">
                      <span className="pill-button-contents">
                        {name}{' '}
                        <button
                          disabled={this.state.updatingLabelIgnores}
                          onClick={async () => {
                            this.setState({ updatingLabelIgnores: true })
                            await requestWithCredentials({
                              path: `/me/ignores/labels/${id}`,
                              method: 'DELETE'
                            })
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

  async onFollowItemClick(url, type) {
    try {
      this.setState({ updatingFollowWithUrl: url })
      const props = {
        body: [{ url }]
      }

      await requestJSONwithCredentials({
        path: `/me/follows/${type}s`,
        method: 'POST',
        ...props
      })

      await this.updateFollows()
    } catch (e) {
      console.error(e)
    } finally {
      this.setState({ updatingFollowWithUrl: null })
    }
  }

  getFollowItemDisabled(type, url) {
    return (
      this.state.updatingFollowWithUrl !== null ||
      (type === 'artist'
        ? this.state.artistFollows
        : type === 'label'
        ? this.state.labelFollows
        : this.state.playlistFollows
      ).find(R.propEq('url', url))
    )
  }
}

export default Settings
