import Preview from './Preview.js'
import Tracks from './Tracks.js'
import { requestWithCredentials } from './request-json-with-credentials.js'
import React, { Component } from 'react'
import * as R from 'ramda'
import MediaSession from '@mebtte/react-media-session'
import FollowPopup from './FollowPopup'
import IgnorePopup from './IgnorePopup'
import { namesToString, followableNameLinks, trackArtistsAndTitleText, trackTitle } from './trackFunctions'
import { PlayerHelp } from './PlayerHelp'

class Player extends Component {
  constructor(props) {
    super(props)
    const allStores = this.props.stores.map(({ storeName }) => storeName)
    const enabledStores = JSON.parse(window.localStorage.getItem('enabledStores')) || allStores
    const enabledStoreSearch = JSON.parse(window.localStorage.getItem('enabledStoreSearch')) || allStores
    this.state = {
      currentTrack: null,
      listenedTracks: 0,
      togglingCurrentInCart: false,
      nextDoubleClickStarted: false,
      playPauseDoubleClickStarted: false,
      helpActive: false,
      enabledStores,
      enabledStoreSearch
    }

    this.preview = React.createRef()
  }

  async componentDidMount() {
    const that = this
    try {
      document.addEventListener('keydown', async event => {
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
              that.preview.current.togglePlaying()
              break
            case 'r':
              await this.playNextUnheard()
              break
            case 'd':
              this.seek(this.getSeekDistance())
              break
            case 'a':
              this.seek(-this.getSeekDistance())
              break
            case 'p':
              await this.toggleCurrentInCart()
              break
            default:
          }
        }
      })
      const carts = this.props.carts
      if (carts.length !== 0 && !Number.isNaN(this.props.initialPosition)) {
        const currentTrack = carts[0].tracks[this.props.initialPosition - 1]
        await this.setCurrentTrack(currentTrack)
      }
    } catch (e) {
      console.error('Failed to handle key press', e)
    }
  }

  mergeHeardStatus(tracks) {
    if (!tracks) return
    this.props.heardTracks.forEach(heardTrack => {
      const index = tracks.findIndex(R.propEq('id', parseInt(heardTrack.id, 10)))
      if (index !== -1) {
        tracks[index] = heardTrack
      }
    })
  }

  getTracks() {
    let tracks
    // TODO: fix this
    if (this.props.mode === 'list') {
      return this.state.tracksData.tracks
    }

    if (this.props.listState === 'new') {
      tracks = this.props.tracks.new.slice()
    } else if (this.props.listState === 'heard') {
      tracks = this.props.heardTracks
    } else if (this.props.listState === 'recent') {
      tracks = this.props.tracks.recentlyAdded.slice()
    } else if (this.props.listState === 'carts') {
      const cartId = this.props.selectedCartId || this.props.carts[0]?.id
      tracks = this.props.carts?.find(R.propEq('id', cartId))?.tracks || []
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

  seek(offset) {
    this.preview.current.scan(offset)
  }

  getSeekDistance() {
    if (!this.props.currentTrack) return -1
    const preview = this.props.currentTrack.previews.find(R.propEq('url', this.preview.current.state.previewUrl))

    return ((preview ? preview.length_ms : this.props.currentTrack.duration) / 5 / 1000) | 7
  }

  async handleNextClick() {
    if (this.state.nextDoubleClickStarted) {
      this.setState({ nextDoubleClickStarted: false })
      await this.playNextTrack()
    } else {
      const that = this
      this.setState({ nextDoubleClickStarted: true })
      setTimeout(() => {
        that.setState({ nextDoubleClickStarted: false })
      }, 200)
      this.seek(this.getSeekDistance())
    }
  }

  async handlePreviousClick() {
    if (this.state.previousDoubleClickStarted) {
      this.setState({ previousDoubleClickStarted: false })
      await this.playPreviousTrack()
    } else {
      this.setState()
      const that = this
      this.setState({ previousDoubleClickStarted: true })
      setTimeout(() => {
        that.setState({ previousDoubleClickStarted: false })
      }, 200)
      this.seek(-this.getSeekDistance())
    }
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
      this.props.currentTrack.id
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
      ? enabledStores.filter(name => name !== storeName)
      : [...enabledStores, storeName]

    window.localStorage.setItem('enabledStores', JSON.stringify(newState))

    this.setState({
      enabledStores: newState
    })
  }

  toggleStoreSearchEnabled(storeName) {
    const { enabledStoreSearch } = this.state
    const newState = enabledStoreSearch.includes(storeName)
      ? enabledStoreSearch.filter(name => name !== storeName)
      : [...enabledStoreSearch, storeName]

    window.localStorage.setItem('enabledStoreSearch', JSON.stringify(newState))

    this.setState({
      enabledStoreSearch: newState
    })
  }

  async handleMarkPurchasedButtonClick() {
    this.setState({ processingCart: true })
    try {
      await this.props.onMarkPurchased(this.props.id)
    } finally {
      this.setState({ processingCart: false })
    }
  }

  async refreshListAndClosePopups() {
    await this.props.onUpdateTracksClicked()
    this.props.onClosePopups()
  }

  render() {
    const tracks = this.getTracks()
    const currentTrack = this.props.currentTrack
    const inCarts = currentTrack
      ? this.props.carts.filter(cart => cart.tracks?.find(R.propEq('id', currentTrack.id)))
      : []
    return (
      <div className={`page-container ${this.props.isMobile ? 'mobile' : ''}`} style={{ ...this.props.style }}>
        <PlayerHelp active={this.state.helpActive} onActiveChanged={active => this.setState({ helpActive: active })} />
        <MediaSession
          title={currentTrack ? trackTitle(currentTrack) : ''}
          artist={currentTrack ? namesToString(currentTrack.artists) : ''}
          onSeekBackward={() => console.log('seek backward')}
          onSeekForward={() => console.log('seek forward')}
          onPreviousTrack={() => this.handlePreviousClick()}
          onNextTrack={() => this.handleNextClick()}
        />
        <Preview
          mode={this.props.mode}
          togglingCurrentInCart={this.state.togglingCurrentInCart}
          showHint={this.props.tracks.length === 0}
          currentTrack={currentTrack}
          onPrevious={() => this.playPreviousTrack()}
          onNext={() => this.playNextTrack()}
          newTracks={this.props.meta ? this.props.meta.newTracks - this.state.listenedTracks : null}
          totalTracks={this.props.meta ? this.props.meta.totalTracks : null}
          onMarkAllHeardClicked={this.props.onMarkAllHeardClicked}
          onToggleCurrentInCart={this.toggleCurrentInCart.bind(this)}
          onPlayPauseToggle={this.handlePlayPauseToggle.bind(this)}
          inCart={this.isCurrentInCart()}
          ref={this.preview}
          onHelpButtonClicked={() => {
            this.setState({ helpActive: !this.state.helpActive })
          }}
          stores={this.props.stores}
          follows={this.props.follows}
          selectedCart={this.props.carts?.find(({ id }) => id === this.props.selectedCartId)}
          listState={this.props.listState}
          carts={this.props.carts}
          inCarts={inCarts}
          processingCart={this.props.processingCart}
          onCartButtonClick={this.props.onHandleCartButtonClick.bind(this)}
          onCreateCartClick={this.props.onHandleCreateCartClick.bind(this)}
          onMarkPurchasedButtonClick={this.handleMarkPurchasedButtonClick.bind(this)}
          onIgnoreClicked={() => {
            return this.props.onOpenIgnorePopup(currentTrack)
          }}
          onFollowClicked={() => {
            return this.props.onOpenFollowPopup(currentTrack)
          }}
        />
        <Tracks
          mode={this.props.mode}
          carts={this.props.carts}
          notifications={this.props.notifications}
          selectedCart={this.props.carts?.find(({ id }) => id === this.props.selectedCartId)}
          tracks={tracks}
          stores={this.props.stores}
          listState={this.props.listState}
          currentTrack={(currentTrack || {}).id}
          processingCart={this.props.processingCart}
          follows={this.props.follows}
          notificationsEnabled={this.props.notificationsEnabled}
          search={this.props.search}
          sort={this.props.sort}
          onFollow={this.props.onFollow}
          onUpdateTracksClicked={this.props.onUpdateTracksClicked}
          onAddToCart={this.props.onAddToCart}
          onCreateCart={this.props.onCreateCart}
          onUpdateCarts={this.props.onUpdateCarts}
          onRemoveFromCart={this.props.onRemoveFromCart}
          onMarkPurchased={this.props.onMarkPurchased.bind(this)}
          onIgnoreArtistsByLabels={this.props.onIgnoreArtistsByLabels}
          onPreviewRequested={id => {
            const requestedTrack = R.find(R.propEq('id', id), this.getTracks())
            const requestedTrackIndex = this.getTrackIndex(requestedTrack)
            const trackCount = this.getTracks().length - 1
            if (requestedTrackIndex === trackCount) {
              this.props.onUpdateTracksClicked()
            }
            this.props.onSetCurrentTrack(requestedTrack)
          }}
          onFollowClicked={this.props.onOpenFollowPopup.bind(this)}
          onIgnoreClicked={this.props.onOpenIgnorePopup.bind(this)}
          onShowNewClicked={this.props.onSetListState.bind(this, 'new')}
          onShowHeardClicked={this.props.onSetListState.bind(this, 'heard')}
          onShowRecentlyAddedClicked={this.props.onSetListState.bind(this, 'recent')}
          onSelectCart={this.props.onSelectCart.bind(this)}
          onRequestNotificationUpdate={this.props.onRequestNotificationUpdate}
          onToggleStoreEnabled={this.toggleStoreEnabled.bind(this)}
          enabledStores={this.state.enabledStores}
          onToggleStoreSearchEnabled={this.toggleStoreSearchEnabled.bind(this)}
          enabledStoreSearch={this.state.enabledStoreSearch}
          onCartButtonClick={this.props.onHandleCartButtonClick.bind(this)}
          onCreateCartClick={this.props.onHandleCreateCartClick.bind(this)}
          onMarkPurchasedButtonClick={this.handleMarkPurchasedButtonClick.bind(this)}
        />
      </div>
    )
  }
}

export default Player
