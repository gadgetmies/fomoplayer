import './Tracks.css'
import React, { Component } from 'react'
import * as R from 'ramda'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import SpinnerButton from './SpinnerButton'
import './Select.css'
import Track from './Track'
import Spinner from './Spinner'
import { Link, withRouter } from 'react-router-dom'
import ToggleButton from './ToggleButton'
import SearchBar from './SearchBar'

const filterMatches = (filter, { artists, title, keys, labels, releases }) => {
  const trackDetailsString = [
    ...artists.map(R.prop('name')),
    title,
    ...keys.map(R.prop('key')),
    ...releases.map(R.prop('name')),
    ...labels.map(R.prop('name')),
  ]
    .join(' ')
    .toLowerCase()

  return trackDetailsString.includes(filter)
}

class Tracks extends Component {
  constructor(props) {
    super(props)
    this.state = {
      selectedTrack: (props.tracks[0] || {}).id,
      currentTrack: -1,
      currentBelowScreen: false,
      currentAboveScreen: false,
      createdNotifications: new Set(),
      modifyingNotification: false,
      fetchingCartDetails: false,
      trackListFilter: '',
      trackListFilterDebounced: '',
      trackListFilterDebounce: undefined,
    }
    this.handleScroll = this.handleScroll.bind(this)
  }

  /*
  componentDidMount() {
    if (this.props.search !== undefined) {
      this.triggerSearch().then(() => {})
    }
  }
   */

  handleScroll() {
    let currentBelowScreen = false
    let currentAboveScreen = false
    const current = document.querySelector('.playing')

    if (current) {
      const currentRect = current.getBoundingClientRect()
      const parentRect = current.parentElement.getBoundingClientRect()
      if (currentRect.y - parentRect.y > parentRect.height - 80) {
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

  adjustOffset(offset) {
    const { history } = this.props
    const {
      location: { pathname },
    } = history
    const updatedOffset = this.props.tracksOffset + offset
    const filter = `?offset=${updatedOffset}`
    history.push(pathname + filter)
    this.props.onSelectCart(this.props.selectedCart.uuid, filter)
  }

  renderTracks(tracks) {
    const emptyListLabels = {
      search:
        this.props.searchError !== undefined
          ? this.props.searchError
          : this.props.searchInProgress
            ? 'Searching...'
            : 'No results',
      carts:
        this.props.carts.length === 0
          ? 'Loading carts...'
          : tracks.length === 0
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
      recent: 'No tracks added',
    }
    const defaultCart = this.props.carts.find(R.prop('is_default'))

    return this.props.searchInProgress ? (
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
            genres,
            score,
            score_details,
            heard,
            stores,
            version,
          } = track
          const inCarts = this.props.carts.filter((cart) => cart.tracks?.find(R.propEq('id', id)))
          const selectedCartId = this.props.selectedCart?.id
          const selectedCartIsPurchased = this.props.selectedCart?.is_purchased
          return (
            <Track
              mode={this.props.mode}
              listState={this.props.listState}
              cartUuid={this.props.selectedCart?.uuid}
              carts={this.props.carts}
              cartFilter={this.props.cartFilter}
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
              bpms={Array.from(new Set(stores.map(R.prop('bpm'))))}
              genres={genres}
              score={score}
              scoreDetails={score_details}
              trackStores={stores}
              stores={this.props.stores}
              selected={this.state.selectedTrack === id}
              playing={this.props.currentTrack === id}
              version={version}
              heard={heard}
              enabledStores={this.props.enabledStores}
              enabledStoreSearch={this.props.enabledStoreSearch}
              selectedCart={this.props.selectedCart}
              inDefaultCart={defaultCart ? defaultCart.tracks?.find(R.propEq('id', id)) !== undefined : false}
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
              onFollowClicked={() => {
                this.props.onFollowClicked(track)
              }}
              onIgnoreClicked={() => {
                this.props.onIgnoreClicked(track)
              }}
              onIgnoreArtistsByLabels={() =>
                this.props.onIgnoreArtistsByLabels({
                  artistIds: artists.map(R.prop('id')),
                  labelIds: labels.map(R.prop('id')),
                })
              }
              onCartButtonClick={this.props.onCartButtonClick}
              onCreateCartClick={this.props.onCreateCartClick}
              onMarkPurchasedButtonClick={this.props.onMarkPurchasedButtonClick}
              onCartFilterChange={this.props.onCartFilterChange}
              onMarkHeardButtonClick={this.props.onMarkHeardButtonClick}
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

  render() {
    const scrollToCurrentButton = (
      <button
        className={'pill pill-button pill-button-glow'}
        onClick={this.scrollCurrentIntoView}
        style={{ padding: '4px 8px', minHeight: 'initial' }}
      >
        <span className="pill-button-contents">Scroll to current</span>
      </button>
    )

    return (
      <div style={{ height: this.props.height, borderTop: '1px solid black' }} className="tracks">
        {this.props.listState === 'carts' && (
          <div className={'top-bar input-layout'} style={{ width: '100%' }}>
            <div className="tracks-top_bar_group" style={{ width: '100%', display: 'flex', padding: 4 }}>
              {this.props.mode === 'app' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div className={'select'} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <select
                      style={{ textAlign: 'left' }}
                      className={'button button-push_button button-push_button-primary button-push_button-small'}
                      id="cart-select"
                      value={this.props.selectedCart?.uuid}
                      onChange={async (e) => {
                        this.setState({ fetchingCartDetails: true })
                        const cartUuid = e.target.value
                        this.props.history.push(`/carts/${cartUuid}`)
                        await this.props.onSelectCart(cartUuid)
                        this.setState({ fetchingCartDetails: false })
                      }}
                    >
                      {this.props.carts.map(({ id, is_default, is_purchased, name, uuid }) => (
                        <option value={uuid} key={id}>
                          {is_default || is_purchased ? '⭐️ ' : ''}
                          {name}
                        </option>
                      ))}
                    </select>
                    <FontAwesomeIcon
                      icon={'caret-down'}
                      style={{ position: 'absolute', right: 8, pointerEvents: 'none' }}
                    />
                  </div>
                  <SearchBar
                    placeholder={'Filter'}
                    value={this.state.cartFilter}
                    loading={this.state.trackListFilterDebounce}
                    onChange={({ target: { value: filter } }) => {
                      // TODO: replace aborted and debounce with flatmapLatest
                      if (this.state.trackListFilterDebounce) {
                        clearTimeout(this.state.trackListFilterDebounce)
                        this.setState({ trackListFilterDebounce: undefined })
                      }

                      this.setState({ cartFilter: filter })

                      if (filter === '') {
                        this.setState({ trackListFilterDebounce: undefined, trackListFilterDebounced: '' })
                        clearTimeout(this.state.trackListFilterDebounce)
                        return
                      }

                      const timeout = setTimeout(
                        function (filter) {
                          if (this.state.cartFilter !== filter) {
                            return
                          }

                          clearTimeout(this.state.trackListFilterDebounce)
                          this.setState({ trackListFilterDebounce: undefined, trackListFilterDebounced: filter })
                        }.bind(this, filter),
                        500,
                      )
                      this.setState({ trackListFilterDebounce: timeout })
                    }}
                    onClearSearch={() => {
                      this.setState({
                        cartFilter: '',
                        trackListFilterDebounced: '',
                        trackListFilterDebounce: undefined,
                      })
                    }}
                  />
                  <span className="select_button-button select_button-button">
                    Tracks in cart: {this.props.selectedCart?.track_count}
                    {this.props.selectedCart?.track_count > 200 &&
                      ` (showing ${this.props.tracksOffset + 1} - ${Math.min(
                        this.props.tracksOffset + this.props.tracks.length,
                        this.props.selectedCart?.track_count,
                      )})`}
                  </span>
                </div>
              ) : (
                <span className="select_button-button select_button-button select_button-button__active">
                  {this.props.carts[0].name}
                </span>
              )}
            </div>
          </div>
        )}
        {this.props.loading && (
          <div onMouseDown={(e) => e.stopPropagation()} className="loading-overlay">
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
                  <div className={'genre-cell track-table-cell'}>Genre</div>
                  <div className={'bpm-cell track-table-cell'}>BPM</div>
                  <div className={'key-cell track-table-cell'}>Key</div>
                </div>
              </th>
              {this.props.mode === 'app' && (
                <th className={'follow-ignore-cart-cell tracks-cell'}>
                  <div className={'score-cell track-table-cell'}>{this.props.listState === 'new' && 'Score'}</div>
                  <div className={'cart-cell track-table-cell'}>Cart</div>
                </th>
              )}
              <th className={'open-share-cell tracks-cell'}>
                <div className={'open-cell track-table-cell popup_container'} style={{ padding: 0, margin: 4 }}>
                  <div className={'popup-anchor'}>
                    <span
                      className={` ${
                        this.props.listState === 'carts' &&
                        this.props.enabledStores &&
                        this.props.enabledStores.length < this.props.stores.length &&
                        'filter-active'
                      }`}
                    >
                      Open {this.props.listState === 'carts' && <FontAwesomeIcon icon="caret-down" />}
                    </span>
                  </div>
                  {this.props.listState === 'carts' && (
                    <div className={'popup_content'} style={{ flexDirection: 'column', minWidth: 150, padding: 8 }}>
                      <div>Enabled stores:</div>
                      {this.props.stores.map(({ storeName }) => {
                        const elementId = `${storeName}-enabled`
                        return (
                          <div
                            key={elementId}
                            className="input-layout"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}
                          >
                            <label htmlFor={elementId} className="noselect" style={{ flex: 1, textAlign: 'left' }}>
                              {storeName}
                            </label>
                            <div style={{ display: 'flex', justifyContent: 'space-around', flex: 0 }}>
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
                        const storeDisabled =
                          this.props.stores.some(R.propEq('storeName', storeName)) &&
                          !this.props.enabledStores?.includes(storeName)
                        if (storeDisabled) return null
                        return (
                          <div
                            key={elementId}
                            className="input-layout"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}
                          >
                            <label htmlFor={elementId} className="noselect" style={{ flex: 1, textAlign: 'left' }}>
                              {storeName}
                            </label>
                            <div style={{ display: 'flex', justifyContent: 'space-around', flex: 0 }}>
                              <ToggleButton
                                id={elementId}
                                checked={storeDisabled ? false : this.props.enabledStoreSearch?.includes(storeName)}
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
                  textAlign: 'center',
                }}
              >
                {scrollToCurrentButton}
              </td>
            </tr>
            {this.renderTracks(
              this.props.listState === 'carts'
                ? this.props.tracks.filter(
                    ({ artists, title, labels, keys, releases, stores }) =>
                      (!this.state.trackListFilterDebounced ||
                        filterMatches(this.state.trackListFilterDebounced, {
                          artists,
                          title,
                          keys,
                          labels,
                          releases,
                        })) &&
                      this.props.enabledStores?.some((storeName) => stores.find(R.propEq('name', storeName))),
                  )
                : this.props.tracks,
            )}
            {['new', 'recent', 'heard'].includes(this.props.listState) ? (
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
            ) : this.props.listState === 'carts' ? (
              <tr style={{ display: 'flex' }}>
                <td style={{ flex: 1 }}>
                  <SpinnerButton
                    size={'large'}
                    loading={this.state.updatingTracks}
                    disabled={this.props.tracksOffset === 0}
                    onClick={this.adjustOffset.bind(this, -200)}
                    style={{ margin: 'auto', height: '100%', display: 'block' }}
                    label={'Previous page'}
                  />
                </td>
                <td style={{ flex: 1 }}>
                  <SpinnerButton
                    size={'large'}
                    loading={this.state.updatingTracks}
                    disabled={this.props.tracks.length < 200}
                    onClick={this.adjustOffset.bind(this, 200)}
                    style={{ margin: 'auto', height: '100%', display: 'block' }}
                    label={'Next page'}
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
                  textAlign: 'center',
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
}

export default withRouter(Tracks)
