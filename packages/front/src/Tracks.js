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
import Popup from './Popup'
import { isMobile } from 'react-device-detect'

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
      cartFilter: '',
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
    parent.scrollBy({ top: currentRect.y - parentRect.y, behavior: 'smooth' })
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

  onCartFilterChange(filter) {
    this.setState({ cartFilter: filter })
  }

  renderTracks(tracks) {
    const defaultCart = this.props.carts.find(R.prop('is_default'))

    return (
      <>
        {tracks.length !== 0 &&
          !this.props.searchInProgress &&
          tracks.map((track, index) => {
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
              previews,
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
            return (
              <Track
                mode={this.props.mode}
                listState={this.props.listState}
                cartUuid={this.props.selectedCart?.uuid}
                carts={this.props.carts}
                cartFilter={this.state.cartFilter}
                defaultCartId={this.props.carts.find(R.prop('is_default'))?.id}
                selectedCartId={selectedCartId}
                selectedCartIsPurchased={this.props.selectedCartIsPurchased}
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
                key={`track-${id}`}
                follows={this.props.follows}
                noPreviews={previews.every(({ url, store }) => !url && store !== 'bandcamp')}
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
                onCartFilterChange={this.onCartFilterChange.bind(this)}
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
        style={{ padding: '4px 8px' }}
      >
        <span className="pill-button-contents">Scroll to current</span>
      </button>
    )

    const tracks = this.props.tracks

    const emptyListLabels = {
      search:
        this.props.searchError !== undefined
          ? this.props.searchError
          : this.props.searchInProgress
            ? 'Searching...'
            : 'No results',
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

    const emptyLabel = emptyListLabels[this.props.listState]
    const listInfo =
      this.props.listState === 'carts' && this.props.carts.length === 0 ? (
        <th>
          <Spinner />
          Loading carts...
        </th>
      ) : tracks.length === 0 && emptyLabel ? (
        <th>{emptyLabel}</th>
      ) : this.props.searchInProgress ? (
        <th>
          Searching <Spinner />
        </th>
      ) : this.props.fetchingCartDetails ? (
        <th>
          Fetching cart details <Spinner />
        </th>
      ) : this.props.listState === 'search' ? (
        <th>{tracks.length} results</th>
      ) : null
    return (
      <div
        style={{
          height: this.props.height,
          borderTop: '1px solid black',
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
        }}
        className="tracks"
      >
        {this.props.loading && (
          <div onMouseDown={(e) => e.stopPropagation()} className="loading-overlay">
            <Spinner size="large" />
          </div>
        )}
        <table className="tracks-table" style={{ display: 'flex', flexDirection: 'column' }}>
          <thead className={'noselect tracks-table-header'}>
            {this.props.listState === 'carts' && !listInfo && (
              <tr
                className={'top-bar input-layout'}
                style={{ width: '100%', borderBottom: '1px solid black', background: 'rgb(34, 34, 34)' }}
              >
                <td
                  className="tracks-top_bar_group"
                  style={{
                    padding: 4,
                  }}
                >
                  {this.props.mode === 'app' ? (
                    <>
                      <SearchBar
                        placeholder={'Filter'}
                        value={this.state.trackListFilter}
                        loading={this.state.trackListFilterDebounce}
                        className={'cart-filter'}
                        style={{ maxWidth: '50ch' }}
                        onChange={({ target: { value: filter } }) => {
                          // TODO: replace aborted and debounce with flatmapLatest
                          if (this.state.trackListFilterDebounce) {
                            clearTimeout(this.state.trackListFilterDebounce)
                            this.setState({ trackListFilterDebounce: undefined })
                          }

                          this.setState({ trackListFilter: filter })

                          if (filter === '') {
                            this.setState({ trackListFilterDebounce: undefined, trackListFilterDebounced: '' })
                            clearTimeout(this.state.trackListFilterDebounce)
                            return
                          }

                          const timeout = setTimeout(
                            function (filter) {
                              if (this.state.trackListFilter !== filter) {
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
                            trackListFilter: '',
                            trackListFilterDebounced: '',
                            trackListFilterDebounce: undefined,
                          })
                        }}
                      />
                      <span className={'cart-details'}>
                        Tracks in cart: {this.props.selectedCart?.track_count}
                        {this.props.selectedCart?.track_count > 200 &&
                          ` (showing ${this.props.tracksOffset + 1} - ${Math.min(
                            this.props.tracksOffset + tracks.length,
                            this.props.selectedCart?.track_count,
                          )})`}
                      </span>
                    </>
                  ) : (
                    <span className="select_button-button select_button-button select_button-button__active">
                      {this.props.carts[0].name}
                    </span>
                  )}
                </td>
              </tr>
            )}

            {listInfo && (
              <tr style={{ display: 'block', borderBottom: '1px solid black', padding: '0 8px', background: '#222' }}>
                {listInfo}
              </tr>
            )}

            <tr className={'noselect tracks-table-header-columns'}>
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
                <div className={'open-cell track-table-cell'}>
                  <Popup
                    popupStyle={{ flexDirection: 'column', minWidth: 150 }}
                    disabled={this.props.listState !== 'carts'}
                    style={{ display: 'block' }}
                    anchor={
                      <div
                        className={` ${
                          (this.props.listState === 'carts' &&
                            this.props.enabledStores &&
                            this.props.enabledStores.length < this.props.stores.length &&
                            'filter-active') ||
                          ''
                        }`}
                      >
                        Open {this.props.listState === 'carts' && <FontAwesomeIcon icon="caret-down" />}
                      </div>
                    }
                  >
                    <>
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
                    </>
                  </Popup>
                </div>
              </th>
            </tr>
          </thead>
          <tbody style={{ overflow: 'scroll', display: 'block', flex: 1 }} onScroll={this.handleScroll}>
            <tr style={{ width: '100%', background: 'none', position: 'fixed', zIndex: 1, marginTop: 3 }}>
              <td
                style={{
                  width: '100%',
                  display: this.state.currentAboveScreen ? 'flex' : 'none',
                  justifyContent: 'center',
                }}
              >
                {scrollToCurrentButton}
              </td>
            </tr>

            <tr style={{ width: '100%', background: 'none', position: 'fixed', bottom: 67, zIndex: 1 }}>
              <td
                style={{
                  width: '100%',
                  display: this.state.currentBelowScreen ? 'flex' : 'none',
                  justifyContent: 'center',
                }}
              >
                {scrollToCurrentButton}
              </td>
            </tr>
            {this.renderTracks(
              this.props.listState === 'carts'
                ? tracks.filter(
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
                : tracks,
            )}
          </tbody>
          <tfoot>
            {['new', 'recent', 'heard'].includes(this.props.listState) ? (
              <tr style={{ display: 'flex' }}>
                <td style={{ flex: 1, margin: 8 }}>
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
              <tr style={{ display: 'flex', justifyContent: 'center', background: 'rgb(34, 34, 34)' }}>
                <td style={{ display: 'flex', gap: 16, margin: 8 }}>
                  <SpinnerButton
                    size={isMobile ? 'small' : 'large'}
                    loading={this.state.updatingTracks}
                    disabled={this.props.tracksOffset === 0}
                    onClick={this.adjustOffset.bind(this, -200)}
                    label={'Previous page'}
                  />
                  <SpinnerButton
                    size={isMobile ? 'small' : 'large'}
                    loading={this.state.updatingTracks}
                    disabled={tracks.length < 200}
                    onClick={this.adjustOffset.bind(this, 200)}
                    label={'Next page'}
                  />
                </td>
              </tr>
            ) : (
              <tr style={{ display: 'flex' }}>
                <td style={{ flex: 1, margin: 8 }}>
                  <SpinnerButton
                    size={isMobile ? 'small' : 'large'}
                    style={{ visibility: 'hidden' }}
                    label={'\u00A0'}
                  />
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    )
  }
}

export default withRouter(Tracks)
