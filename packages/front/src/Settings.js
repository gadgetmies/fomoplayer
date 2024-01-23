import './Settings.css'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
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
import { Link, withRouter } from 'react-router-dom'
import { apiURL } from './config'
import ExternalLink from './ExternalLink'
import Onboarding from './Onboarding'
import { SettingsHelp } from './SettingsHelp'
import ImportPlaylistButton from './ImportPlaylistButton'
import FollowedItem from './FollowedItem'
import SearchBar from './SearchBar'

const spotifyAuthorizationURL = `${apiURL}/auth/spotify?path=/settings/integrations`
const AuthorizationButtons = props => (
  <>
    <p>
      <span className={'input-layout'}>
        {!props.hasWriteAccess && (
          <a
            href={`${spotifyAuthorizationURL}&write=true`}
            className="button button-push_button button-push_button-small button-push_button-primary no-style-link"
          >
            Grant read and write access
          </a>
        )}
        {props.hasWriteAccess !== false && (
          <>
            <a
              href={`${spotifyAuthorizationURL}&write=false`}
              className="button button-push_button button-push_button-small button-push_button-primary no-style-link"
            >
              {props.hasWriteAccess === true ? 'Revoke write access' : 'Grant read-only access'}
            </a>
          </>
        )}
      </span>
      {props.hasWriteAccess === true && <RevokeWarning />}
    </p>
  </>
)

const RevokeWarning = () => (
  <div style={{ fontSize: '75%', marginTop: 5 }}>Warning! This will disable all cart synchronizations</div>
)

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
    let page = window.location.pathname.split('/').pop()
    page = !page || page === 'settings' ? 'following' : page

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
      updatingCartSync: null,
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
      syncedCarts: Object.fromEntries(
        props.carts.filter(R.prop('store_details')).map(({ id, store_details }) => [id, store_details])
      ),
      page,
      scoreWeights: this.props.scoreWeights,
      tracks: this.props.tracks,
      helpActive: false,
      importingPlaylist: null,
      importedPlaylists: [],
      importedArtists: [],
      exportingFollowedArtists: false,
      followedArtistsExportSuccess: null,
      authorizations: []
    }

    this.markHeardButton.bind(this)
  }

  async componentDidMount() {
    try {
      await Promise.all([this.updateFollows(), this.updateIgnores(), this.updateAuthorizations()])
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

  async updateAuthorizations() {
    const authorizations = await requestJSONwithCredentials({
      path: `/me/authorizations`
    })
    this.setState({ authorizations })
  }

  async setCartPublic(cartId, setPublic) {
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

  async setCartSync(cartId, setSync) {
    this.setState({ updatingCartSync: cartId })
    try {
      await requestWithCredentials({
        path: `/me/carts/${cartId}/sync/spotify`,
        method: 'POST',
        body: { setSync }
      })
      const updatedSyncedCarts = { ...this.state.syncedCarts }
      setSync ? (updatedSyncedCarts[cartId] = ['spotify']) : delete updatedSyncedCarts[cartId]
      this.setState({ syncedCarts: updatedSyncedCarts })
    } catch (e) {
      console.error('Failed to set cart sync status', e)
    } finally {
      this.setState({ updatingCartSync: null, updatingCarts: false })
    }
  }

  onShowPage(page) {
    this.setState({ page })
    this.props.history.push(`/settings/${page}`)
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

  clearSearch() {
    this.setState({
      followQuery: '',
      updatingFollowDetails: null,
      followDetails: undefined,
      updatingFollowWithUrl: null
    })
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

  componentDidUpdate({ location: { pathname: prevPath } }) {
    const newPath = this.props.location.pathname
    if (prevPath !== newPath && this.props.location.pathname.startsWith('/settings')) {
      this.setState({ page: newPath.split('/').pop() || 'following' })
    }
  }

  render() {
    const spotifyAuthorization = this.state.authorizations?.find(R.propEq('store_name', 'Spotify'))
    return (
      <div className="page-container scroll-container" style={{ ...this.props.style }}>
        <SettingsHelp
          active={this.state.helpActive}
          onActiveChanged={active => this.setState({ helpActive: active })}
        />
        <div className="settings-container">
          <h2>
            Settings{' '}
            <FontAwesomeIcon
              icon="circle-question"
              style={{ fontSize: '50%', verticalAlign: 'top' }}
              onClick={() => {
                this.setState({ helpActive: !this.state.helpActive })
              }}
              data-onboarding-id="help-button"
            />
          </h2>
          <div>
            <div className="select-button select-button--container state-select-button--container noselect">
              <input
                type="radio"
                id="settings-state-following"
                name="settings-state"
                checked={this.state.page === 'following'}
                onChange={() => this.onShowPage('following')}
              />
              <label
                className="select_button-button  select_button-button__large"
                htmlFor="settings-state-following"
                data-help-id="following-tab"
              >
                Following
              </label>
              <input
                type="radio"
                id="settings-state-sorting"
                name="settings-state"
                checked={this.state.page === 'sorting'}
                onChange={() => this.onShowPage('sorting')}
              />
              <label
                className="select_button-button  select_button-button__large"
                htmlFor="settings-state-sorting"
                data-help-id="sorting-tab"
              >
                Sorting
              </label>
              <input
                type="radio"
                id="settings-state-carts"
                name="settings-state"
                checked={this.state.page === 'carts'}
                onChange={() => this.onShowPage('carts')}
              />
              <label
                className="select_button-button  select_button-button__large"
                htmlFor="settings-state-carts"
                data-help-id="carts-tab"
              >
                Carts
              </label>
              <input
                type="radio"
                id="settings-state-notifications"
                name="settings-state"
                checked={this.state.page === 'notifications'}
                onChange={() => this.onShowPage('notifications')}
              />
              <label
                className="select_button-button select_button-button__large"
                htmlFor="settings-state-notifications"
                data-help-id="notifications-tab"
              >
                Notifications
              </label>
              <input
                type="radio"
                id="settings-state-ignores"
                name="settings-state"
                checked={this.state.page === 'ignores'}
                onChange={() => this.onShowPage('ignores')}
              />
              <label
                className="select_button-button select_button-button__large"
                htmlFor="settings-state-ignores"
                data-help-id="ignores-tab"
              >
                Ignores
              </label>
              <input
                type="radio"
                id="settings-state-collection"
                name="settings-state"
                checked={this.state.page === 'collection'}
                onChange={() => this.onShowPage('collection')}
              />
              <label
                className="select_button-button select_button-button__large"
                htmlFor="settings-state-collection"
                data-help-id="collection-tab"
              >
                Collection
              </label>
              <input
                type="radio"
                id="settings-state-integrations"
                name="settings-state"
                checked={this.state.page === 'integrations'}
                onChange={() => this.onShowPage('integrations')}
              />
              <label
                className="select_button-button select_button-button__large"
                htmlFor="settings-state-integrations"
                data-help-id="integrations-tab"
              >
                Integrations
              </label>
            </div>
          </div>
          {this.state.page === 'following' ? (
            <>
              <label>
                <h4>Search by name or URL to follow:</h4>
                <div className="input-layout" style={{ maxWidth: '40ch' }} data-onboarding-id="follow-search">
                  <SearchBar
                    disabled={this.state.updatingFollowWithUrl !== null}
                    styles="large dark"
                    value={this.state.followQuery}
                    onClearSearch={this.clearSearch.bind(this)}
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
                            requestWithCredentials({
                              path: `/stores/${storeName}/search/?q=${this.state.followQuery}`
                            })
                              .then(async res => (await res.json()).map(result => ({ stores: [storeName], ...result })))
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
                          Promise.all(promises)
                            .catch(e => {
                              console.error('Error updating follow details', e)
                              clearTimeout(this.state.followDetailsDebounce)
                              this.setState({
                                updatingFollowDetails: null,
                                followDetailsDebounce: undefined
                              })
                            })
                            .finally(() => {
                              if (!this.state.followDetailsUpdateAborted && this.state.followDetails?.length !== 0) {
                                if (Onboarding.active && Onboarding.isCurrentStep(Onboarding.steps.Search)) {
                                  return setTimeout(() => Onboarding.helpers.next(), 500)
                                }
                              }
                            })
                        }
                      }, 500)
                      this.setState({ followDetailsDebounce: timeout })
                    }}
                  />
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
                                          onClick={(() => this.onFollowItemClick(url, name, type)).bind(this)}
                                          data-onboarding-id="follow-item"
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
                <div style={{ fontSize: '75%', marginTop: 5 }}>
                  <a
                    href=""
                    onClick={e => {
                      e.preventDefault()
                      this.setState({ page: 'integrations' })
                    }}
                  >
                    To import followed artists from Spotify use the integrations tab
                  </a>
                </div>
              </label>
              <h4>Followed artists ({this.state.artistFollows.length})</h4>
              <ul className="no-style-list follow-list">
                {this.state.artistFollows.map(
                  ({ name, storeArtistId, store: { name: storeName, starred, watchId }, url }) => {
                    return (
                      <li key={storeArtistId} data-onboarding-id="follow-item">
                        <FollowedItem
                          disabled={this.state.updatingArtistFollows}
                          onStarClick={async e => {
                            e.stopPropagation()
                            this.setState({ updatingArtistFollows: true })
                            await this.props.onSetStarred('artists', watchId, !starred)
                            await this.updateArtistFollows()
                            this.setState({ updatingArtistFollows: false })
                            if (Onboarding.active && Onboarding.isCurrentStep(Onboarding.steps.Star)) {
                              setTimeout(() => Onboarding.helpers.next(), 500)
                            }
                          }}
                          onUnfollowClick={async () => {
                            this.setState({ updatingArtistFollows: true })
                            await requestWithCredentials({
                              path: `/me/follows/artists/${storeArtistId}`,
                              method: 'DELETE'
                            })
                            await this.updateArtistFollows()
                            this.setState({ updatingArtistFollows: false })
                            if (Onboarding.active && Onboarding.isCurrentStep(Onboarding.steps.Unfollow)) {
                              setTimeout(() => {
                                document.querySelector('[data-onboarding-id=support-button]').scrollIntoView()
                                Onboarding.helpers.next()
                              }, 500)
                            }
                          }}
                          {...{ storeName, title: name, starred, url }}
                        />
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
                      <FollowedItem
                        disabled={this.state.updatingLabelFollows}
                        onStarClick={async e => {
                          e.stopPropagation()
                          this.setState({ updatingLabelFollows: true })
                          await this.props.onSetStarred('labels', watchId, !starred)
                          await this.updateLabelFollows()
                          this.setState({ updatingLabelFollows: false })
                        }}
                        onUnfollowClick={async () => {
                          this.setState({ updatingLabelFollows: true })
                          await requestWithCredentials({
                            path: `/me/follows/labels/${storeLabelId}`,
                            method: 'DELETE'
                          })
                          await this.updateLabelFollows()
                          this.setState({ updatingLabelFollows: false })
                        }}
                        {...{ storeName, title: name, starred, url }}
                      />
                    </li>
                  )
                )}
              </ul>
              <h4>Followed playlists ({this.state.playlistFollows.length})</h4>
              <ul className="no-style-list follow-list">
                {this.state.playlistFollows.map(({ id, storeName, title }) => (
                  <li key={id}>
                    <FollowedItem
                      disabled={this.state.updatingPlaylistFollows}
                      onUnfollowClick={async () => {
                        this.setState({ updatingPlaylistFollows: true })
                        await requestWithCredentials({
                          path: `/me/follows/playlists/${id}`,
                          method: 'DELETE'
                        })
                        await this.updatePlaylistFollows()
                        this.setState({ updatingPlaylistFollows: false })
                      }}
                      {...{ storeName, title }}
                    />
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
                mode={'list'}
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
                <h4>Create a new cart:</h4>
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
                    label="Create"
                    loadingLabel="Creating"
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
              <h3>Carts</h3>
              <div>
                {this.props.carts.map(({ id, is_default, is_public, is_purchased, name, uuid }, index) => {
                  const buttonId = `sharing-${id}`
                  const publicLink = new URL(`/cart/${uuid}`, window.location).toString()
                  const spotifyStoreDetails = this.state.syncedCarts[id]?.find(
                    ({ store_name }) => store_name === 'Spotify'
                  )
                  return (
                    <div key={id}>
                      <h4 style={{ marginTop: index === 0 ? '1rem' : '3rem' }}>{name}</h4>
                      <div>
                        <p style={{ display: 'flex', alignItems: 'center', gap: 16 }} className="input-layout">
                          <label htmlFor={buttonId} className="noselect">
                            Sharing enabled:
                          </label>
                          <ToggleButton
                            id={buttonId}
                            checked={is_public}
                            disabled={this.state.settingCartPublic !== null || this.state.updatingCarts}
                            onChange={state => this.setCartPublic(id, state)}
                          />
                          {this.state.settingCartPublic === id ? <Spinner size="small" /> : null}
                          {this.state.publicCarts.has(id) ? (
                            <>
                              <ExternalLink href={publicLink}>Open cart&nbsp;</ExternalLink>
                              <CopyToClipboardButton content={publicLink} label={'Copy link'} />
                            </>
                          ) : null}
                        </p>
                      </div>
                      {!spotifyAuthorization ? (
                        <p>
                          Grant Fomo Player access to Spotify from the{' '}
                          <a
                            style={{ textDecoration: 'underline' }}
                            onClick={this.onShowPage.bind(this, 'integrations')}
                          >
                            Integrations tab
                          </a>{' '}
                          to enable synchronization
                        </p>
                      ) : (
                        <>
                          <p className="input-layout" style={{ display: 'flex', alignItems: 'center' }}>
                            <label htmlFor={`${uuid}-sync`} className="noselect">
                              Spotify sync enabled:
                            </label>
                            <ToggleButton
                              id={`${uuid}-sync`}
                              checked={spotifyStoreDetails}
                              disabled={this.state.updatingCartSync !== null || this.state.updatingCarts}
                              onChange={state => this.setCartSync(id, state)}
                            />
                            {this.state.updatingCartSync === id ? <Spinner size="small" /> : null}
                          </p>
                          {spotifyStoreDetails && (
                            <p>
                              <ExternalLink href={spotifyStoreDetails.url}>Open Spotify playlist</ExternalLink>
                            </p>
                          )}
                        </>
                      )}
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
                  <li key={`${id}-${storeName}`}>
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
                            await this.props.onRequestNotificationUpdate([
                              {
                                op: 'remove',
                                storeName,
                                text
                              }
                            ])

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
                  className={`button button-push_button button-push_button-small button-push_button-primary`}
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
          {this.state.page === 'integrations' ? (
            <>
              <p>
                Fomo Player can synchronize your cart contents with Spotify playlists and import followed artists as
                well as playlists from Spotify.
              </p>
              <p>
                To enable synchronization of Spotify playlists with Fomo Player carts and to export followed artists to
                Spotify, you need to grant Fomo Player read and write rights in order to create playlists for the carts
                and to manage those playlists and the artist follows in your Spotify account. If however you do not need
                the synchronization and export, or are afraid of granting write access, you can grant only read access
                to enable importing playlists and followed artists from Spotify.
              </p>
              <p>
                The authorize links below will take you to a Spotify page where you can grant the rights. After granting
                the rights, you will be taken back to Fomo Player and you can enable cart synchronization in the{' '}
                <a style={{ textDecoration: 'underline' }} onClick={this.onShowPage.bind(this, 'carts')}>
                  Carts tab
                </a>{' '}
                in the settings.
              </p>
              <h4>Spotify</h4>
              {spotifyAuthorization ? (
                <>
                  <p>
                    <SpinnerButton
                      onClick={this.onDeauthorizeSpotifyClicked.bind(this)}
                      loading={this.state.deauthorizingSpotify}
                    >
                      Revoke authorization
                    </SpinnerButton>
                    <RevokeWarning />
                  </p>
                  <h5>Re-authorize</h5>
                  <p style={{ fontSize: '75%', marginTop: 5 }}>
                    Use this if you want to enable or disable write access to Spotify playlists.
                  </p>
                  <AuthorizationButtons hasWriteAccess={spotifyAuthorization?.has_write_access} />
                  <h5>Export followed artists</h5>
                  <p>
                    <SpinnerButton
                      loading={this.state.exportingFollowedArtists}
                      onClick={async () => {
                        this.setState({ exportingFollowedArtists: true, followedArtistsExportSuccess: null })
                        try {
                          const followedArtists = await requestJSONwithCredentials({
                            path: `/me/follows/artists`,
                            method: 'GET'
                          })

                          await requestWithCredentials({
                            path: `/stores/spotify/my-followed-artists`,
                            method: 'POST',
                            body: followedArtists
                              .filter(({ store: { name } }) => name === 'Spotify')
                              .map(({ url }) => url)
                          })
                          this.setState({ followedArtistsExportSuccess: true })
                        } catch (e) {
                          console.error('Error exporting followed artists', e)
                          this.setState({ followedArtistsExportSuccess: false })
                        } finally {
                          this.setState({ exportingFollowedArtists: false })
                        }
                      }}
                    >
                      Export followed artists to Spotify
                    </SpinnerButton>
                    {this.state.followedArtistsExportSuccess !== null && (
                      <div style={{ fontSize: '75%', marginTop: 5 }}>
                        {this.state.followedArtistsExportSuccess === true
                          ? 'Artist follows exported successfully'
                          : 'Exporting followed artists failed. Please try again.'}
                      </div>
                    )}
                  </p>
                  <h5>Import followed artists</h5>
                  <p>
                    <SpinnerButton
                      loading={this.state.importingFollowedArtists}
                      onClick={async () => {
                        this.setState({ importingFollowedArtists: true, importedArtists: [] })
                        try {
                          const followedArtists = await requestJSONwithCredentials({
                            path: `/stores/spotify/my-followed-artists`,
                            method: 'GET'
                          })

                          const importedArtists = await requestJSONwithCredentials({
                            path: `/me/follows/artists`,
                            method: 'POST',
                            body: followedArtists
                          })
                          await this.updateArtistFollows()
                          this.setState({ importedArtists })
                        } catch (e) {
                          console.error('Error importing followed artists', e)
                          this.setState({ followedArtistsImportFailed: true })
                        } finally {
                          this.setState({ importingFollowedArtists: false })
                        }
                      }}
                    >
                      {this.state.importedArtists ? 'Refresh' : 'Import'} followed artists from Spotify
                    </SpinnerButton>
                    {this.state.followedArtistsImportFailed && (
                      <div style={{ fontSize: '75%', marginTop: 5 }}>
                        Importing followed artists failed. Please try again.
                      </div>
                    )}
                    {this.state.importedArtists.length > 0 && (
                      <h6>{this.state.importedArtists.length} artists imported:</h6>
                    )}
                    {this.state.importedArtists.map(({ name, url }) => {
                      return (
                        <FollowedItem
                          disabled={this.state.updatingArtistFollows}
                          onUnfollowClick={async () => {
                            this.setState({ updatingArtistFollows: true })
                            await requestWithCredentials({
                              path: `/me/follows/artists/${storeArtistId}`,
                              method: 'DELETE'
                            })
                            await this.updateArtistFollows()
                            this.setState({ updatingArtistFollows: false })
                          }}
                          {...{ storeName: 'spotify', title: name, starred: false, url }}
                        />
                      )
                    })}
                  </p>
                  <h5>Import playlists</h5>
                  <p>
                    <SpinnerButton
                      loading={this.state.fetchingPlaylists}
                      onClick={() => {
                        this.setState({ fetchingPlaylists: true, importedPlaylists: null })
                        requestJSONwithCredentials({
                          path: `/stores/spotify/my-playlists`,
                          method: 'GET'
                        })
                          .then(playlists => {
                            this.setState({ spotifyPlaylists: playlists })
                          })
                          .finally(() => this.setState({ fetchingPlaylists: false }))
                      }}
                    >
                      {this.state.spotifyPlaylists ? 'Refresh' : 'Get'} Spotify playlists
                    </SpinnerButton>
                    {this.state.spotifyPlaylists?.length === 0 ? (
                      <h5>No playlists found</h5>
                    ) : (
                      this.state.spotifyPlaylists && <h5>Available playlists</h5>
                    )}
                    <ul className={'no-style-list'} style={{ display: 'flex', flexWrap: 'wrap' }}>
                      {this.state.spotifyPlaylists?.map(({ id, url, name, img }) => (
                        <li key={this.props.id}>
                          <ImportPlaylistButton
                            id={id}
                            name={name}
                            storeName="spotify"
                            type="playlist"
                            url={url}
                            img={img}
                            loading={this.state.importingPlaylist === url}
                            disabled={this.state.importingPlaylist !== null}
                            imported={this.state.importedPlaylists?.includes(url)}
                            onClick={(() => this.onImportPlaylistItemClick(url)).bind(this)}
                            data-onboarding-id="follow-item"
                          />
                        </li>
                      ))}
                    </ul>
                  </p>
                </>
              ) : (
                <>
                  <h5>Authorize</h5>
                  <AuthorizationButtons />
                  <p>
                    <strong>Note</strong>: Even when the authorization is successful, you will not be redirected back to
                    this view (this feature is work in progress). After you return to the player, just reopen the
                    Integrations tab.
                  </p>
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    )
  }

  async onDeauthorizeSpotifyClicked() {
    try {
      this.setState({ deauthorizingSpotify: true })
      await requestWithCredentials({
        method: 'DELETE',
        path: `/me/authorizations/spotify`
      })
      this.setState({ authorizations: [] })
    } catch (e) {
      console.error('Removing authorization failed', e)
    } finally {
      this.setState({ deauthorizingSpotify: false })
    }
  }

  async onFollowItemClick(url, name, type) {
    try {
      this.setState({ updatingFollowWithUrl: url })
      const props = {
        body: [{ url, name }]
      }

      await requestJSONwithCredentials({
        path: `/me/follows/${type}s`,
        method: 'POST',
        ...props
      })

      await this.updateFollows()
      if (Onboarding.active && Onboarding.isCurrentStep(Onboarding.steps.FollowButton)) {
        this.clearSearch()
        Onboarding.moveToNextWhenItemVisible(`[data-onboarding-id="follow-item"]`)
      }
    } catch (e) {
      console.error(e)
    } finally {
      this.setState({ updatingFollowWithUrl: null })
    }
  }

  getFollowItemDisabled(type, url) {
    return this.state.updatingFollowWithUrl !== null || type === 'playlist'
      ? this.state.playlistFollows.find(R.propEq('playlistStoreId', url))
      : (type === 'artist' ? this.state.artistFollows : this.state.labelFollows).find(R.propEq('url', url))
  }

  async onImportPlaylistItemClick(url) {
    this.setState({ importingPlaylist: url })
    try {
      await requestJSONwithCredentials({
        url: `${apiURL}/me/carts`,
        method: 'POST',
        body: { url }
      })
      await this.props.onUpdateCarts()
      this.setState({ importedPlaylists: [...this.state.importedPlaylists, url] })
    } catch (e) {
      console.error('Error importing playlist', e)
      throw e
    } finally {
      this.setState({ importingPlaylist: null })
    }
  }
}

export default withRouter(Settings)
