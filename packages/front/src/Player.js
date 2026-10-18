import Preview from './Preview.js'
import Tracks from './Tracks.js'
import React, { Component } from 'react'
import * as R from 'ramda'
import { PlayerHelp } from './PlayerHelp'
import { isSample, listSource, queueTracks, stepInQueue } from './playQueue'

class Player extends Component {
  constructor(props) {
    super(props)
    const allStores = this.props.stores?.map(({ storeName }) => storeName)
    const enabledStores = JSON.parse(window.localStorage.getItem('enabledStores')) || allStores
    const enabledStoreSearch = JSON.parse(window.localStorage.getItem('enabledStoreSearch')) || allStores
    this.state = {
      listenedTracks: 0,
      togglingCurrentInCart: false,
      helpActive: false,
      enabledStores,
      enabledStoreSearch,
    }

    this.preview = React.createRef()
  }

  async componentDidMount() {
    const that = this
    try {
      document.addEventListener('keydown', async (event) => {
        if (event instanceof KeyboardEvent) {
          if (
            event.target.form ||
            event.altKey ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.target instanceof HTMLInputElement
          ) {
            event.stopPropagation()
            return
          }

          switch (event.key) {
            case 'e':
              await this.playNextTrack()
              break
            case 'q':
              await this.playPreviousTrack()
              break
            case 'w':
              that.preview.current?.togglePlaying('keyboard')
              break
            case 'r':
              await this.playNextUnheard()
              break
            case 'd':
              this.preview.current?.seekForward()
              break
            case 'a':
              this.preview.current?.seekBackward()
              break
            case 'p':
              await this.toggleCurrentInCart()
              break
            default:
          }
        }
      })
      const carts = this.props.carts
      if (carts.length !== 0 && this.props.initialPosition !== undefined) {
        const currentTrack = carts[0].tracks[this.props.initialPosition - 1]
        await this.props.onSetCurrentTrack(currentTrack)
      }
    } catch (e) {
      console.error('Failed to handle key press', e)
    }
  }

  componentDidUpdate(prevProps) {
    const storesChanged = prevProps.stores !== this.props.stores
    if (!storesChanged || !this.props.stores?.length) return

    const availableStores = this.props.stores.map(({ storeName }) => storeName)
    const enabledStores = this.state.enabledStores.filter((store) => availableStores.includes(store))
    const enabledStoreSearch = this.state.enabledStoreSearch.filter((store) => availableStores.includes(store))

    const nextState = {}
    if (enabledStores.length === 0) {
      nextState.enabledStores = availableStores
      window.localStorage.setItem('enabledStores', JSON.stringify(availableStores))
    }
    if (enabledStoreSearch.length === 0) {
      nextState.enabledStoreSearch = availableStores
      window.localStorage.setItem('enabledStoreSearch', JSON.stringify(availableStores))
    }

    if (Object.keys(nextState).length > 0) {
      this.setState(nextState)
    }
  }

  mergeHeardStatus(tracks) {
    if (!tracks) return
    this.props.heardTracks.forEach((heardTrack) => {
      const index = tracks.findIndex(R.propEq(parseInt(heardTrack.id, 10), 'id'))
      if (index !== -1) {
        tracks[index].heard = heardTrack.heard
      }
    })
  }

  getTracks() {
    let tracks
    if (this.props.mode === 'list') {
      return this.props.tracks
    }

    if (this.props.listState === 'new') {
      tracks = this.props.tracks.new.slice()
    } else if (this.props.listState === 'heard') {
      tracks = this.props.heardTracks
    } else if (this.props.listState === 'recent') {
      tracks = this.props.tracks.recentlyAdded.slice()
    } else if (this.props.listState === 'carts') {
      tracks = this.props.selectedCart?.tracks || []
    } else if (this.props.listState === 'search') {
      tracks = this.props.searchResults
    } else {
      tracks = []
    }
    this.mergeHeardStatus(tracks)
    return tracks
  }

  // The list on screen as a play-queue source; null in the embedded cart player.
  getOnScreenSource() {
    if (this.props.mode === 'list') return null
    return listSource({
      listState: this.props.listState,
      selectedCart: this.props.selectedCart,
      location: window.location,
    })
  }

  // The tracks next / previous step through: the list the current track was started from.
  getQueueTracks() {
    if (this.props.mode === 'list') return this.getTracks()
    return queueTracks(this.props.playingFrom, { source: this.getOnScreenSource(), tracks: this.getTracks() })
  }

  getTrackIndex(track) {
    return R.findIndex(R.propEq(track.id, 'id'), this.getTracks())
  }

  isPlayable(track) {
    if (isSample(track)) return true
    const storeSlugs = this.props.stores.map(({ storeName }) => storeName.toLowerCase())
    return (track.previews || []).some(({ store }) => storeSlugs.includes(store))
  }

  async jumpTracks(numberOfTracksToJump) {
    const queue = this.getQueueTracks()
    const currentId = this.props.currentTrack?.id
    const nextTrack = stepInQueue(queue, currentId, numberOfTracksToJump, (track) => this.isPlayable(track))
    if (!nextTrack) {
      if (numberOfTracksToJump > 0) this.setPlaying(false)
      return
    }

    // Load more of New when playback nears its end, while New is both the source and on screen
    const playingFromNew = this.props.playingFrom?.source?.key === 'new' || !this.props.playingFrom?.source
    if (playingFromNew && this.props.listState === 'new' && queue.indexOf(nextTrack) >= queue.length - 1) {
      this.props.onUpdateTracksClicked()
    }

    await this.props.onSetCurrentTrack(nextTrack)
  }

  async playPreviousTrack() {
    await this.jumpTracks(-1)
  }

  async playNextTrack() {
    await this.jumpTracks(1)
  }

  async playNextUnheard() {
    const currentId = this.props.currentTrack?.id
    const nextUnheard = this.getQueueTracks().find(
      (track) => track.id !== currentId && R.isNil(track.heard) && this.isPlayable(track),
    )
    if (nextUnheard) await this.props.onSetCurrentTrack(nextUnheard)
  }

  setPlaying(playing) {
    this.preview.current.setPlaying(playing)
  }

  async toggleCurrentInCart() {
    this.setState({ togglingCurrentInCart: true })
    await (this.isCurrentInDefaultCart() ? this.props.onRemoveFromCart : this.props.onAddToCart)(
      this.getDefaultCart().id,
      this.props.currentTrack.id,
    )
    this.setState({ togglingCurrentInCart: false })
  }

  isCurrentInDefaultCart() {
    const currentTrack = this.props.currentTrack
    const defaultCart = this.getDefaultCart()
    if (!currentTrack || !defaultCart) return null
    const liveRow = this.getTracks().find(R.propEq(currentTrack.id, 'id'))
    const carts = (liveRow && liveRow.carts) || currentTrack.carts || []
    return carts.some((c) => c && c.uuid === defaultCart.uuid) ? true : null
  }

  getDefaultCart() {
    return this.props.carts.find(R.prop('isDefault'))
  }

  async handlePlayPauseToggle(playing, source) {
    if (this.props.mode !== 'app') return
    if (!['keyboard', 'media'].includes(source)) return

    // Double-pressing play/pause to add the current track to the default cart
    // is opt-out and configurable per device (see the Player settings tab).
    if ((localStorage.getItem('playPauseDoubleClickAddToCart') || 'true') !== 'true') return

    // The flag is kept on the instance rather than in state on purpose:
    // media-key events arrive in the same React 18 batch, so a setState flag
    // would still read its stale value on the second event and the
    // double-click would never be detected. The window defaults wide (1s)
    // because on AirPods a fast double-press triggers the OS skip gesture, so
    // the two play/pause presses must be deliberately spaced out to reach us.
    const delay = parseInt(localStorage.getItem('playPauseDoubleClickDelay'), 10) || 1000
    if (this._playPauseDoubleClickStarted) {
      clearTimeout(this._playPauseDoubleClickTimer)
      this._playPauseDoubleClickStarted = false
      const configuredCartId = localStorage.getItem('playPauseDoubleClickCartId')
      const targetCart =
        (configuredCartId && this.props.carts.find((cart) => String(cart.id) === configuredCartId)) ||
        this.getDefaultCart()
      if (targetCart && this.props.currentTrack) {
        await this.props.onAddToCart(targetCart.id, this.props.currentTrack.id)
      }
    } else {
      this._playPauseDoubleClickStarted = true
      this._playPauseDoubleClickTimer = setTimeout(() => {
        this._playPauseDoubleClickStarted = false
      }, delay)
    }
  }

  toggleStoreEnabled(storeName) {
    const { enabledStores } = this.state
    const newState = enabledStores.includes(storeName)
      ? enabledStores.filter((name) => name !== storeName)
      : [...enabledStores, storeName]

    window.localStorage.setItem('enabledStores', JSON.stringify(newState))

    this.setState({
      enabledStores: newState,
    })
  }

  toggleStoreSearchEnabled(storeName) {
    const { enabledStoreSearch } = this.state
    const newState = enabledStoreSearch.includes(storeName)
      ? enabledStoreSearch.filter((name) => name !== storeName)
      : [...enabledStoreSearch, storeName]

    window.localStorage.setItem('enabledStoreSearch', JSON.stringify(newState))

    this.setState({
      enabledStoreSearch: newState,
    })
  }

  async refreshListAndClosePopups() {
    await this.props.onUpdateTracksClicked()
    this.props.onClosePopups()
  }

  async markHeard(id) {
    const track =
      this.getQueueTracks().find(R.propEq(id, 'id')) ||
      (this.props.currentTrack?.id === id ? this.props.currentTrack : undefined)
    if (track) return this.props.markHeard(track)
  }

  async toggleHeard(id, heard) {
    return this.props.setHeard(this.getTracks().find(R.propEq(id, 'id')), heard)
  }

  render() {
    const tracks = this.getTracks()
    const currentTrack = this.props.currentTrack
    const hasSelectedTrack = Boolean(currentTrack && tracks.some(({ id }) => id === currentTrack.id))
    const liveCurrentRow = currentTrack ? tracks.find(({ id }) => id === currentTrack.id) : null
    const currentCarts = (liveCurrentRow && liveCurrentRow.carts) || (currentTrack && currentTrack.carts) || []
    const inCarts = currentTrack
      ? this.props.carts.filter((cart) => currentCarts.some((c) => c && c.uuid === cart.uuid))
      : []
    const selectedCartId = this.props.selectedCart?.id
    const selectedCartIsPurchased = this.props.selectedCart?.isPurchased
    const defaultCart = this.props.carts.find(R.prop('isDefault'))
    const inDefaultCart =
      !!(defaultCart && currentTrack && currentCarts.some((c) => c && c.uuid === defaultCart.uuid))
    const inCurrentCart = inCarts.find(({ id }) => id === selectedCartId)

    return (
      <div
        className={`page-container${this.props.docked ? ' page-container--docked' : ''}`}
        // panelOnly: the Preview panel above a page that brings its own lists (Notifications)
        style={{
          flexDirection: 'column',
          overflow: 'hidden',
          ...(this.props.panelOnly ? { flex: '0 0 auto' } : {}),
          ...this.props.style,
        }}
      >
        <PlayerHelp
          active={this.state.helpActive}
          onActiveChanged={(active) => this.setState({ helpActive: active })}
        />
        <Preview
          carts={this.props.carts}
          currentTrack={currentTrack}
          follows={this.props.follows}
          inCarts={inCarts}
          defaultCartId={defaultCart?.id}
          inDefaultCart={inDefaultCart}
          inCurrentCart={inCurrentCart}
          selectedCartId={selectedCartId}
          listState={this.props.listState}
          mode={this.props.mode}
          newTracks={this.props.meta ? this.props.meta.newTracks - this.state.listenedTracks : null}
          processingCart={this.props.processingCart}
          processingTrack={this.props.processingTrack}
          selectedCart={this.props.selectedCart}
          selectedCartIsPurchased={selectedCartIsPurchased}
          showHint={this.props.tracks.length === 0}
          stores={this.props.stores}
          togglingCurrentInCart={this.state.togglingCurrentInCart}
          totalTracks={this.props.meta ? this.props.meta.totalTracks : null}
          isMobile={this.props.isMobile}
          ref={this.preview}
          markHeard={this.markHeard.bind(this)}
          onCartButtonClick={this.props.onHandleCartButtonClick?.bind(this)}
          onCreateCartClick={this.props.onHandleCreateCartClick?.bind(this)}
          onFollowClicked={() => this.props.onOpenFollowPopup(currentTrack)}
          onHelpButtonClicked={() => this.setState({ helpActive: !this.state.helpActive })}
          onIgnoreClicked={() => this.props.onOpenIgnorePopup(currentTrack)}
          onMarkAllHeardClicked={this.props.onMarkAllHeardClicked}
          onMarkPurchasedButtonClick={this.props.onMarkPurchased}
          onNext={() => this.playNextTrack()}
          onPlayPauseToggle={this.handlePlayPauseToggle.bind(this)}
          onPrevious={() => this.playPreviousTrack()}
          onToggleCurrentInCart={this.toggleCurrentInCart.bind(this)}
          onAddEntityToSearch={this.props.onAddEntityToSearch}
          hasSelectedTrack={hasSelectedTrack}
          docked={this.props.docked}
          playingFrom={this.props.mode === 'list' ? null : this.props.playingFrom?.source}
        />
        <div style={{ display: this.props.docked || this.props.panelOnly ? 'none' : 'contents' }}>
          <Tracks
            mode={this.props.mode}
            carts={this.props.carts}
            fetchingCartDetails={this.props.fetchingCartDetails}
            notifications={this.props.notifications}
            selectedCart={this.props.selectedCart}
            selectedCartIsPurchased={selectedCartIsPurchased}
            tracks={tracks}
            stores={this.props.stores}
            listState={this.props.listState}
            currentTrack={(currentTrack || {}).id}
            processingCart={this.props.processingCart}
            processingTrack={this.props.processingTrack}
            follows={this.props.follows}
            notificationsEnabled={this.props.notificationsEnabled}
            searchTerms={this.props.searchTerms}
            cartSearch={this.props.cartSearch}
            onCartSearchChange={this.props.onCartSearchChange}
            onCartSearchMiss={this.props.onCartSearchMiss}
            onSaveCartSearchGroup={this.props.onSaveCartSearchGroup}
            onFindSimilarToCart={this.props.onFindSimilarToCart}
            searchInProgress={this.props.searchInProgress}
            searchError={this.props.searchError}
            sort={this.props.sort}
            enabledStores={this.state.enabledStores}
            enabledStoreSearch={this.state.enabledStoreSearch}
            loadingMore={this.props.loadingMore}
            hasMore={this.props.hasMore}
            onAddToCart={this.props.onAddToCart}
            onCartButtonClick={this.props.onHandleCartButtonClick?.bind(this)}
            onCreateCart={this.props.onCreateCart}
            onCreateCartClick={this.props.onHandleCreateCartClick?.bind(this)}
            onFollowClicked={this.props.onOpenFollowPopup?.bind(this)}
            onIgnoreArtistsByLabels={this.props.onIgnoreArtistsByLabels}
            onIgnoreClicked={this.props.onOpenIgnorePopup?.bind(this)}
            onLoadMore={this.props.onLoadMore}
            onMarkPurchasedButtonClick={this.props.onMarkPurchased}
            onPreviewRequested={(requestedTrack) => {
              const requestedTrackIndex = this.getTrackIndex(requestedTrack)
              const trackCount = this.getTracks().length - 1
              if (requestedTrackIndex === trackCount) this.props.onUpdateTracksClicked()
              const source = this.getOnScreenSource()
              this.props.onSetCurrentTrack(requestedTrack, source ? { source, tracks: this.getTracks() } : null)
            }}
            onRemoveFromCart={this.props.onRemoveFromCart}
            onRequestNotificationUpdate={this.props.onRequestNotificationUpdate}
            onSelectCart={this.props.onSelectCart?.bind(this)}
            onToggleStoreEnabled={this.toggleStoreEnabled.bind(this)}
            onToggleStoreSearchEnabled={this.toggleStoreSearchEnabled.bind(this)}
            onUpdateCarts={this.props.onUpdateCarts}
            onUpdateTracksClicked={this.props.onUpdateTracksClicked}
            onMarkHeardButtonClick={this.markHeard.bind(this)}
            onToggleHeard={this.toggleHeard.bind(this)}
            onAddEntityToSearch={this.props.onAddEntityToSearch}
          />
        </div>
      </div>
    )
  }
}

export default Player
