import './Tracks.css'
import React, { Component } from 'react'
import * as R from 'ramda'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import SpinnerButton from './SpinnerButton'
import { requestWithCredentials } from './request-json-with-credentials'
import { isMobile } from 'react-device-detect'
import './Select.css'
import Track from './Track'
import Spinner from './Spinner'
import { Link } from 'react-router-dom'
import ToggleButton from './ToggleButton'

class Tracks extends Component {
  constructor(props) {
    super(props)
    this.state = {
      selectedTrack: (props.tracks[0] || {}).id,
      selectedCart: props.selectedCart,
      currentTrack: -1,
      markingHeard: false,
      currentBelowScreen: false,
      currentAboveScreen: false,
      search: props.search,
      searchOpen: false,
      searchDebounce: undefined,
      searchInProgress: false,
      createdNotifications: new Set(),
      modifyingNotification: false,
      searchError: undefined,
      fetchingCartDetails: false
    }
    this.handleScroll = this.handleScroll.bind(this)
  }

  componentDidMount() {
    if (this.props.search !== undefined) {
      this.triggerSearch().then(() => {})
    }
  }

  handleScroll() {
    let currentBelowScreen = false
    let currentAboveScreen = false
    const current = document.querySelector('.playing')

    if (current) {
      const currentRect = current.getBoundingClientRect()
      const parentRect = current.parentElement.getBoundingClientRect()
      if (currentRect.y - parentRect.y > parentRect.height) {
        currentBelowScreen = true
      } else if (currentRect.y - parentRect.y + currentRect.height < 0) {
        currentAboveScreen = true
      }
    }
    this.setState({ currentBelowScreen, currentAboveScreen })
  }

  scrollCurrentIntoView() {
    const current = document.querySelector('.playing')
    const currentRect = current.getBoundingClientRect()
    const parent = current.parentElement
    const parentRect = parent.getBoundingClientRect()
    parent.scrollBy(0, currentRect.y - parentRect.y)
  }

  async triggerSearch() {
    return this.setSearch(this.state.search, true)
  }

  async setSearch(search, skipDebounce = false) {
    this.setState({ search, searchError: undefined })

    if (this.state.searchDebounce) {
      clearTimeout(this.state.searchDebounce)
    }

    if (search === '') {
      this.props.onSearchResults([])
      return
    }

    const timeout = setTimeout(
      async () => {
        this.setState({ searchDebounce: undefined, searchInProgress: true })
        try {
          const results = await (
            await requestWithCredentials({ path: `/tracks?q=${search}&sort=${this.props.sort}` })
          ).json()
          this.props.onSearchResults(results)
        } catch (e) {
          console.error(e)
          this.setState({ searchError: 'Search failed, please try again.' })
          this.props.onSearchResults([])
        } finally {
          this.setState({ searchInProgress: false })
        }
      },
      skipDebounce ? 0 : 1000
    )
    this.setState({ searchDebounce: timeout })
  }

  toggleSearch() {
    this.setState({ searchOpen: !this.state.searchOpen })
  }

  renderTracks(tracks, carts, enabledStoreSearch) {
    const emptyListLabels = {
      search:
        this.state.searchError !== undefined
          ? this.state.searchError
          : this.props.searchDebounce !== undefined
          ? 'Searching...'
          : 'No results',
      cart:
        carts.length === 0
          ? 'Loading carts...'
          : this.props.tracks.length === 0
          ? 'Cart empty'
          : 'No tracks matching filters',
      new: (
        <>
          No tracks available. Perhaps you need to{' '}
          <Link to={'/settings'}>
            <strong>follow more artists and labels</strong>
          </Link>
          ?
        </>
      ),
      heard: 'No tracks played',
      recent: 'No tracks added'
    }
    const defaultCart = carts.find(R.prop('is_default'))

    return this.state.searchInProgress ? (
      <tr style={{ display: 'block' }} key={'search-in-progress'}>
        <td>
          Searching <Spinner />
        </td>
      </tr>
    ) : this.state.fetchingCartDetails ? (
      <tr style={{ display: 'block' }} key={'search-in-progress'}>
        <td>
          Fetching cart details <Spinner />
        </td>
      </tr>
    ) : tracks.length === 0 ? (
      <tr style={{ display: 'block' }} key={'no-results'}>
        <td>{emptyListLabels[this.props.listState]}</td>
      </tr>
    ) : (
      <>
        {this.props.listState === 'search' ? (
          <tr style={{ display: 'block' }} key={'result-count'}>
            <td>{tracks.length} results</td>
          </tr>
        ) : null}
        {tracks.map((track, index) => {
          const {
            id,
            title,
            mix,
            artists,
            remixers,
            labels,
            releases,
            released,
            published,
            added,
            keys,
            score,
            score_details,
            heard,
            stores,
            version
          } = track
          const inCarts = this.props.carts.filter(cart => cart.tracks?.find(R.propEq('id', id)))
          const selectedCartId = this.props.selectedCart?.id
          const selectedCartIsPurchased = this.props.selectedCart?.is_purchased
          return (
            <Track
              mode={this.props.mode}
              listState={this.props.listState}
              cartUuid={this.props.selectedCart?.uuid}
              carts={this.props.carts}
              defaultCartId={this.props.carts.find(R.prop('is_default'))?.id}
              selectedCartId={selectedCartId}
              selectedCartIsPurchased={selectedCartIsPurchased}
              id={id}
              index={index}
              title={title}
              artists={artists}
              mix={mix}
              remixers={remixers}
              labels={labels}
              released={released}
              releases={releases}
              published={published}
              added={added}
              keys={keys}
              bpms={stores.map(R.prop('bpm'))}
              score={score}
              scoreDetails={score_details}
              stores={stores}
              selected={this.state.selectedTrack === id}
              playing={this.props.currentTrack === id}
              version={version}
              heard={heard}
              enabledStoreSearch={enabledStoreSearch}
              inDefaultCart={defaultCart ? defaultCart.tracks?.find(R.propEq('id', id)) !== undefined : false}
              selectedCart={this.props.selectedCart}
              inCurrentCart={inCarts.find(({ id }) => id === selectedCartId) !== undefined}
              inCarts={inCarts}
              popupAbove={tracks.length > 10 && tracks.length - index < 10}
              processingCart={this.props.processingCart}
              key={id}
              follows={this.props.follows}
              onClick={() => {
                this.props.onPreviewRequested(id)
              }}
              onDoubleClick={() => {
                this.props.onPreviewRequested(id)
              }}
              onTouchTap={() => {
                this.props.onPreviewRequested(id)
              }}
              onAddToCart={this.props.onAddToCart}
              onCreateCart={this.props.onCreateCart}
              onUpdateCarts={this.props.onUpdateCarts}
              onRemoveFromCart={this.props.onRemoveFromCart}
              onMarkPurchased={this.props.onMarkPurchased}
              onFollowClicked={() => {
                this.props.onFollowClicked(track)
              }}
              onIgnoreClicked={() => {
                this.props.onIgnoreClicked(track)
              }}
              onIgnoreArtistsByLabels={() =>
                this.props.onIgnoreArtistsByLabels({
                  artistIds: artists.map(R.prop('id')),
                  labelIds: labels.map(R.prop('id'))
                })
              }
            />
          )
        })}
      </>
    )
  }

  async refreshTracks() {
    this.setState({ updatingTracks: true })
    try {
      await this.props.onUpdateTracksClicked()
    } finally {
      this.setState({ updatingTracks: false })
    }
  }

  isSubscribed(storeName) {
    const notificationSubscriptions = this.getNotificationSubscriptions()
    return notificationSubscriptions.find(({ storeName: name }) => storeName === name) !== undefined
  }

  async handleToggleNotificationClick(e, storeNames = undefined) {
    const notificationSubscriptions = this.getNotificationSubscriptions()
    const search = this.state.search
    e.stopPropagation()
    this.setState({ modifyingNotification: true })

    let operations = []
    try {
      if (storeNames === undefined) {
        if (notificationSubscriptions.length === 0) {
          operations = operations.concat(
            this.props.stores.map(({ storeName }) => ({
              op: 'add',
              storeName,
              text: search
            }))
          )
        } else {
          operations = operations.concat(
            notificationSubscriptions.map(({ storeName }) => ({ op: 'remove', storeName, text: search }))
          )
        }
      } else {
        storeNames.forEach(storeName => {
          const subscribed = this.isSubscribed(storeName)
          operations.push({ op: subscribed ? 'remove' : 'add', storeName, text: search })
        })
      }

      await this.props.onRequestNotificationUpdate(operations)
    } finally {
      this.setState({ modifyingNotification: false })
    }
  }

  render() {
    const scrollToCurrentButton = (
      <button
        className={'button button-push_button-small button-push_button-primary button-push_button-glow'}
        onClick={this.scrollCurrentIntoView}
      >
        Scroll to current
      </button>
    )

    const notificationSubscriptions = this.getNotificationSubscriptions()
    const notificationSubscriptionDisabled =
      this.state.search === '' || this.state.modifyingNotification || !this.props.notificationsEnabled
    const notificationSubscriptionLoading = this.state.modifyingNotification
    const subscribed = notificationSubscriptions.length > 0

    return (
      <div style={{ height: this.props.height, position: 'relative' }}>
        <div className={'top-bar input-layout'}>
          {this.props.mode === 'app' ? (
            <div className="top-bar-group">
              <div className="select-button select-button--container state-select-button--container noselect">
                <input
                  type="radio"
                  id="tracklist-state-new"
                  name="tracklist-state"
                  defaultChecked={this.props.listState === 'new'}
                  onChange={this.props.onShowNewClicked}
                />
                <label
                  className="select-button--button state-select-button--button"
                  htmlFor="tracklist-state-new"
                  data-help-id="new-tracks"
                >
                  New tracks
                </label>
                <input
                  type="radio"
                  id="tracklist-state-recent"
                  name="tracklist-state"
                  defaultChecked={this.props.listState === 'recent'}
                  onChange={this.props.onShowRecentlyAddedClicked}
                />
                <label
                  className="select-button--button state-select-button--button"
                  htmlFor="tracklist-state-recent"
                  data-help-id="recently-added-tracks"
                >
                  Recently added
                </label>
                <input
                  type="radio"
                  id="tracklist-state-heard"
                  name="tracklist-state"
                  defaultChecked={this.props.listState === 'heard'}
                  onChange={this.props.onShowHeardClicked}
                />
                <label
                  className="select-button--button state-select-button--button"
                  htmlFor="tracklist-state-heard"
                  data-help-id="recently-played-tracks"
                >
                  Recently played
                </label>
                <input
                  type="radio"
                  id="tracklist-state-cart"
                  name="tracklist-state"
                  defaultChecked={this.props.listState === 'cart'}
                  onChange={this.props.onShowCartClicked}
                  disabled={this.props.carts.length === 0}
                />
                <label
                  className="select-button--button state-select-button--button"
                  htmlFor="tracklist-state-cart"
                  data-help-id="carts"
                >
                  Carts
                </label>
                <input
                  type="radio"
                  id="tracklist-state-search"
                  name="tracklist-state"
                  defaultChecked={this.props.listState === 'search'}
                  onChange={this.props.onShowSearchClicked}
                />
                <label
                  className="select-button--button state-select-button--button"
                  htmlFor="tracklist-state-search"
                  data-help-id="search"
                >
                  Search
                </label>
              </div>
            </div>
          ) : null}
          {!isMobile && !this.props.mode === 'app' ? (
            <SpinnerButton
              style={{ display: 'inline-block', flex: 0 }}
              className="refresh-tracks"
              size={'small'}
              loading={this.state.updatingTracks}
              onClick={this.refreshTracks.bind(this)}
              label={'Refresh list'}
              loadingLabel={'Refreshing'}
            />
          ) : null}
          {this.props.listState !== 'search' ? null : (
            <>
              <div className="top-bar-group">
                <div className={'input-layout'} style={{ alignItems: 'center', position: 'relative' }}>
                  <label className="search-bar">
                    <input
                      autoFocus
                      id="search"
                      className="search text-input text-input-small text-input-dark"
                      onChange={e => this.setSearch(e.target.value)}
                      onKeyDown={e => {
                        if (e.code === 'Enter') {
                          return this.triggerSearch()
                        }
                      }}
                      value={this.state.search}
                    />
                    {this.state.search ? (
                      <FontAwesomeIcon
                        onClick={() => this.setSearch('')}
                        className={'search-input-icon clear-search'}
                        icon="times-circle"
                      />
                    ) : (
                      <FontAwesomeIcon className={'search-input-icon'} icon="search" />
                    )}
                  </label>
                  <span style={{ position: 'relative', order: 4 }}>
                    <SpinnerButton
                      style={{ width: '7rem', borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                      className={'button button-push_button-small button-push_button-primary'}
                      onClick={this.handleToggleNotificationClick.bind(this)}
                      disabled={notificationSubscriptionDisabled}
                      loading={notificationSubscriptionLoading}
                    >
                      <FontAwesomeIcon icon={subscribed ? 'bell-slash' : 'bell'} />{' '}
                      {subscribed ? 'Unsubscribe' : 'Subscribe'}
                    </SpinnerButton>
                    <span className={'popup-anchor'}>
                      <span
                        className={'button button-push_button-primary button-push_button-small'}
                        style={{
                          backgroundColor: '#000',
                          borderTopLeftRadius: 0,
                          borderBottomLeftRadius: 0,
                          display: 'inline-block'
                        }}
                      >
                        <FontAwesomeIcon icon="caret-down" />
                      </span>
                    </span>
                    <div
                      className={`popup-content notification-popup-content`}
                      style={{ zIndex: 100, boxSizing: 'border-box' }}
                    >
                      {this.props.stores.map(({ storeName, purchaseAvailable }) => {
                        const isSubscribed = notificationSubscriptions.find(R.propEq('storeName', storeName))
                        return (
                          <button
                            disabled={notificationSubscriptionDisabled}
                            style={{ position: 'relative' }}
                            className="button button-push_button-small button-push_button-primary cart-button"
                            onClick={(e => this.handleToggleNotificationClick(e, [storeName])).bind(this)}
                            key={`store-${storeName}`}
                          >
                            <FontAwesomeIcon icon={isSubscribed ? 'bell-slash' : 'bell'} style={{ marginRight: 6 }} />{' '}
                            {storeName}
                            {purchaseAvailable && (
                              <FontAwesomeIcon icon="money-bills" style={{ right: 6, position: 'absolute' }} />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </span>
                  {!this.props.notificationsEnabled && (
                    <div className={'email-not-verified-info'}>
                      Email not set or verified.{' '}
                      <Link to={'/settings?page=notifications'}>
                        <strong>Please update details in the settings</strong>
                      </Link>
                      .
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          {this.props.listState !== 'cart' ? null : (
            <div className="top-bar-group">
              <div className="select-button select-button--container cart-bar">
                <label className="select-button--button select-button--button" htmlFor="cart-select">
                  Cart:
                </label>
                {this.props.mode === 'app' ? (
                  <div className={'select'}>
                    <select
                      id="cart-select"
                      onChange={async e => {
                        this.setState({ fetchingCartDetails: true })
                        await this.props.onSelectCart(parseInt(e.target.value))
                        this.setState({ fetchingCartDetails: false })
                      }}
                    >
                      {this.props.carts.map(cart => (
                        <option value={cart.id} key={cart.id}>
                          {cart.is_default || cart.is_purchased ? '⭐️ ' : ''}
                          {cart.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="select-button--button select-button--button select-button--button__active">
                    {this.props.carts[0].name}
                  </span>
                )}
              </div>
              <span className="select-button--button select-button--button">
                Tracks in cart: {this.props.tracks.length}
              </span>
            </div>
          )}
        </div>
        {this.props.loading && (
          <div onMouseDown={e => e.stopPropagation()} className="loading-overlay">
            <Spinner size="large" />
          </div>
        )}
        <table className="tracks-table" style={{ height: '100%', overflow: 'hidden', display: 'block' }}>
          <thead className={'noselect tracks-table-header'}>
            <tr style={{ display: 'block' }} className={'noselect'}>
              {this.props.mode === 'app' ? (
                <th className={'new-cell tracks-cell'}>
                  <div className={'new-cell-content track-table-cell'}>New</div>
                </th>
              ) : null}
              <th className={'track-details tracks-cell'}>
                <div className={'track-details-left track-details-content'}>
                  <div className={'artist-cell track-table-cell text-header-cell'}>Artist</div>
                  <div className={'title-cell track-table-cell text-header-cell'}>Title</div>
                  <div className={'label-cell track-table-cell text-header-cell'}>Label</div>
                </div>
                <div className={'track-details-center track-details-content'}>
                  {this.props.listState === 'recent' && (
                    <div className={'added-cell track-table-cell text-header-cell'}>Added</div>
                  )}
                  {this.props.listState !== 'recent' && (
                    <div className={'released-cell track-table-cell text-header-cell'}>Released</div>
                  )}
                </div>
                <div className={'track-details-right track-details-content'}>
                  <div className={'bpm-cell track-table-cell'}>BPM</div>
                  <div className={'key-cell track-table-cell'}>Key</div>
                </div>
              </th>
              {this.props.mode === 'app' ? (
                <th className={'follow-ignore-cart-cell tracks-cell'}>
                  {this.props.listState === 'new' && <div className={'score-cell track-table-cell'}>Score</div>}
                  <div className={'follow-cell track-table-cell'}>Follow</div>
                  <div className={'ignore-cell track-table-cell'}>Ignore</div>
                  <div className={'cart-cell track-table-cell'}>Cart</div>
                </th>
              ) : null}
              <th className={'open-share-cell tracks-cell'}>
                <div className={'open-cell track-table-cell'} style={{ position: 'relative' }}>
                  <div className={'popup-anchor'}>
                    <span
                      className={` ${this.props.listState === 'cart' && this.props.enabledStores && this.props.enabledStores.length < this.props.stores.length && 'filter-active'}`}
                    >
                      Open / Share {this.props.listState === 'cart' && <FontAwesomeIcon icon="caret-down" />}
                    </span>
                  </div>
                  {this.props.listState === 'cart' && (
                    <div className={'popup-content header-popup'}>
                      <div>Show tracks available on:</div>
                      {this.props.stores.map(({ storeName }) => {
                        const elementId = `${storeName}-enabled`
                        return (
                          <div
                            className="input-layout"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}
                          >
                            <label htmlFor={elementId} className="noselect" style={{ flex: 1, textAlign: 'left' }}>
                              {storeName}
                            </label>
                            <div style={{ display: 'flex', justifyContent: 'space-around', flex: 1 }}>
                              <ToggleButton
                                id={elementId}
                                checked={this.props.enabledStores?.includes(storeName)}
                                onChange={() => this.props.onToggleStoreEnabled(storeName)}
                              />
                            </div>
                          </div>
                        )
                      })}
                      <hr className={'popup-divider'} />
                      <div>Show search for:</div>
                      {[...this.props.stores, { storeName: 'Youtube' }].map(({ storeName }) => {
                        const elementId = `${storeName}-search-enabled`
                        return (
                          <div
                            className="input-layout"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}
                          >
                            <label htmlFor={elementId} className="noselect" style={{ flex: 1, textAlign: 'left' }}>
                              {storeName}
                            </label>
                            <div style={{ display: 'flex', justifyContent: 'space-around', flex: 1 }}>
                              <ToggleButton
                                id={elementId}
                                checked={this.props.enabledStoreSearch?.includes(storeName)}
                                onChange={() => this.props.onToggleStoreSearchEnabled(storeName)}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody style={{ overflow: 'scroll', display: 'block' }} onScroll={this.handleScroll}>
            <tr style={{ width: '100%', background: 'none', position: 'absolute', zIndex: 1 }}>
              <td
                style={{
                  width: '100%',
                  display: this.state.currentAboveScreen ? 'block' : 'none',
                  textAlign: 'center'
                }}
              >
                {scrollToCurrentButton}
              </td>
            </tr>
            {this.renderTracks(
              this.props.listState === 'cart'
                ? this.props.tracks.filter(({ stores }) =>
                    this.props.enabledStores?.some(storeName => stores.find(R.propEq('name', storeName)))
                  )
                : this.props.tracks,
              this.props.carts,
              this.props.enabledStoreSearch
            )}
            {this.props.listState === 'new' ? (
              <tr style={{ display: 'flex' }}>
                <td style={{ flex: 1 }}>
                  <SpinnerButton
                    size={'large'}
                    loading={this.state.updatingTracks}
                    onClick={this.refreshTracks.bind(this)}
                    style={{ margin: 'auto', height: '100%', display: 'block' }}
                    label={'Refresh'}
                    loadingLabel={'Loading'}
                  />
                </td>
              </tr>
            ) : null}
            <tr style={{ height: 120 }} />
            <tr style={{ width: '100%', background: 'none', position: 'absolute', bottom: 0, zIndex: 1 }}>
              <td
                style={{
                  width: '100%',
                  display: this.state.currentBelowScreen ? 'block' : 'none',
                  textAlign: 'center'
                }}
              >
                {scrollToCurrentButton}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  getNotificationSubscriptions() {
    return this.props.notifications.filter(R.propEq('text', this.state.search?.toLocaleLowerCase()))
  }
}

export default Tracks
