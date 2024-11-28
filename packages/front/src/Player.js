import Preview from './Preview.js'
import Tracks from './Tracks.js'
import React, { Component } from 'react'
import * as R from 'ramda'
import MediaSession from '@mebtte/react-media-session'
import { namesToString, trackTitle } from './trackFunctions'
import { PlayerHelp } from './PlayerHelp'

class Player extends Component {
  constructor(props) {
    super(props)
    const allStores = this.props.stores?.map(({ storeName }) => storeName)
    const enabledStores = JSON.parse(window.localStorage.getItem('enabledStores')) || allStores
    const enabledStoreSearch = JSON.parse(window.localStorage.getItem('enabledStoreSearch')) || allStores
    this.state = {
      listenedTracks: 0,
      togglingCurrentInCart: false,
      playPauseDoubleClickStarted: false,
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
              that.preview.current?.togglePlaying()
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

  mergeHeardStatus(tracks) {
    if (!tracks) return
    this.props.heardTracks.forEach((heardTrack) => {
      const index = tracks.findIndex(R.propEq('id', parseInt(heardTrack.id, 10)))
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

  getCurrentTrackIndex() {
    return this.getTrackIndex(this.props.currentTrack)
  }

  getTrackIndex(track) {
    return R.findIndex(R.propEq('id', track.id), this.getTracks())
  }

  async jumpTracks(numberOfTracksToJump) {
    const currentTrackIndex = this.getCurrentTrackIndex()
    const trackCount = this.getTracks().length - 1
    if (currentTrackIndex === trackCount && this.props.listState !== 'new') {
      this.setPlaying(false)
    } else {
      const indexToJumpTo = R.clamp(0, trackCount, currentTrackIndex + numberOfTracksToJump)
      if (indexToJumpTo === trackCount && this.props.listState === 'new') {
        this.props.onUpdateTracksClicked()
      }

      await this.props.onSetCurrentTrack(this.getTracks()[indexToJumpTo])
    }
  }

  async playPreviousTrack() {
    await this.jumpTracks(-1)
  }

  async playNextTrack() {
    await this.jumpTracks(1)
  }

  async playNextUnheard() {
    const firstUnplayed = this.getTracks().findIndex(R.propSatisfies(R.isNil, 'heard'))
    await this.jumpTracks(firstUnplayed - this.getCurrentTrackIndex())
  }

  setPlaying(playing) {
    this.preview.current.setPlaying(playing)
  }

  async toggleCurrentInCart() {
    this.setState({ togglingCurrentInCart: true })
    await (this.isCurrentInCart() ? this.props.onRemoveFromCart : this.props.onAddToCart)(
      this.getDefaultCart().id,
      this.props.currentTrack.id,
    )
    this.setState({ togglingCurrentInCart: false })
  }

  isCurrentInCart() {
    const currentTrack = this.props.currentTrack
    return currentTrack && this.getDefaultCart()
      ? this.getDefaultCart().tracks?.find(R.propEq('id', currentTrack.id))
      : null
  }

  getDefaultCart() {
    return this.props.carts.find(R.prop('is_default'))
  }

  async handlePlayPauseToggle(playing) {
    if (this.props.mode !== 'app') return
    if (playing && this.state.playPauseDoubleClickStarted) {
      this.setState({ playPauseDoubleClickStarted: false })
      await this.props.onAddToCart(this.getDefaultCart().id, this.props.currentTrack.id)
    } else if (!playing) {
      const that = this
      this.setState({ playPauseDoubleClickStarted: true })
      setTimeout(() => {
        that.setState({ playPauseDoubleClickStarted: false })
      }, 200)
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

  async handleMarkPurchasedButtonClick(trackId) {
    this.setState({ processingCart: true })
    try {
      await this.props.onMarkPurchased(trackId)
    } finally {
      this.setState({ processingCart: false })
    }
  }

  async refreshListAndClosePopups() {
    await this.props.onUpdateTracksClicked()
    this.props.onClosePopups()
  }

  async markHeard(id) {
    return this.props.markHeard(this.getTracks().find(R.propEq('id', id)))
  }

  render() {
    const tracks = this.getTracks()
    const currentTrack = this.props.currentTrack
    const inCarts = currentTrack
      ? this.props.carts.filter((cart) => cart.tracks?.find(R.propEq('id', currentTrack.id)))
      : []
    return (
      <div className={`page-container`} style={{ ...this.props.style }}>
        <PlayerHelp
          active={this.state.helpActive}
          onActiveChanged={(active) => this.setState({ helpActive: active })}
        />
        <Preview
          carts={this.props.carts}
          currentTrack={currentTrack}
          follows={this.props.follows}
          inCart={this.isCurrentInCart()}
          inCarts={inCarts}
          listState={this.props.listState}
          mode={this.props.mode}
          newTracks={this.props.meta ? this.props.meta.newTracks - this.state.listenedTracks : null}
          processingCart={this.props.processingCart}
          selectedCart={this.props.selectedCart}
          showHint={this.props.tracks.length === 0}
          stores={this.props.stores}
          togglingCurrentInCart={this.state.togglingCurrentInCart}
          totalTracks={this.props.meta ? this.props.meta.totalTracks : null}
          ref={this.preview}
          markHeard={this.markHeard.bind(this)}
          onCartButtonClick={this.props.onHandleCartButtonClick?.bind(this)}
          onCreateCartClick={this.props.onHandleCreateCartClick?.bind(this)}
          onFollowClicked={() => this.props.onOpenFollowPopup(currentTrack)}
          onHelpButtonClicked={() => this.setState({ helpActive: !this.state.helpActive })}
          onIgnoreClicked={() => this.props.onOpenIgnorePopup(currentTrack)}
          onMarkAllHeardClicked={this.props.onMarkAllHeardClicked}
          onMarkPurchasedButtonClick={this.handleMarkPurchasedButtonClick?.bind(this)}
          onNext={() => this.playNextTrack()}
          onPlayPauseToggle={this.handlePlayPauseToggle.bind(this)}
          onPrevious={() => this.playPreviousTrack()}
          onToggleCurrentInCart={this.toggleCurrentInCart.bind(this)}
        />
        <Tracks
          mode={this.props.mode}
          carts={this.props.carts}
          cartFilter={this.props.cartFilter}
          notifications={this.props.notifications}
          selectedCart={this.props.selectedCart}
          tracks={tracks}
          tracksOffset={this.props.tracksOffset}
          stores={this.props.stores}
          listState={this.props.listState}
          currentTrack={(currentTrack || {}).id}
          processingCart={this.props.processingCart}
          follows={this.props.follows}
          notificationsEnabled={this.props.notificationsEnabled}
          search={this.props.search}
          searchInProgress={this.props.searchInProgress}
          searchError={this.props.searchError}
          sort={this.props.sort}
          enabledStores={this.state.enabledStores}
          enabledStoreSearch={this.state.enabledStoreSearch}
          onAddToCart={this.props.onAddToCart}
          onCartButtonClick={this.props.onHandleCartButtonClick?.bind(this)}
          onCreateCart={this.props.onCreateCart}
          onCreateCartClick={this.props.onHandleCreateCartClick?.bind(this)}
          onFollowClicked={this.props.onOpenFollowPopup?.bind(this)}
          onIgnoreArtistsByLabels={this.props.onIgnoreArtistsByLabels}
          onIgnoreClicked={this.props.onOpenIgnorePopup?.bind(this)}
          onMarkPurchasedButtonClick={this.handleMarkPurchasedButtonClick.bind(this)}
          onPreviewRequested={(id) => {
            const requestedTrack = R.find(R.propEq('id', id), this.getTracks())
            const requestedTrackIndex = this.getTrackIndex(requestedTrack)
            const trackCount = this.getTracks().length - 1
            if (requestedTrackIndex === trackCount) this.props.onUpdateTracksClicked()
            this.props.onSetCurrentTrack(requestedTrack)
          }}
          onRemoveFromCart={this.props.onRemoveFromCart}
          onRequestNotificationUpdate={this.props.onRequestNotificationUpdate}
          onSelectCart={this.props.onSelectCart?.bind(this)}
          onToggleStoreEnabled={this.toggleStoreEnabled.bind(this)}
          onToggleStoreSearchEnabled={this.toggleStoreSearchEnabled.bind(this)}
          onUpdateCarts={this.props.onUpdateCarts}
          onUpdateTracksClicked={this.props.onUpdateTracksClicked}
          onCartFilterChange={this.props.onCartFilterChange}
          onMarkHeardButtonClick={this.markHeard.bind(this)}
        />
      </div>
    )
  }
}

export default Player
