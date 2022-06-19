import Preview from './Preview.js'
import Tracks from './Tracks.js'
import { requestWithCredentials } from './request-json-with-credentials.js'
import React, { Component } from 'react'
import * as R from 'ramda'
import MediaSession from '@mebtte/react-media-session'
import FollowPopup from './FollowPopup'
import IgnorePopup from './IgnorePopup'
import { trackTitle, artistNamesToString, trackArtistsAndTitle } from './trackFunctions'

class Player extends Component {
  constructor(props) {
    super(props)

    this.state = {
      currentTrack: null,
      heardTracks: props.tracks ? props.tracks.heard : [],
      listenedTracks: 0,
      listState: props.tracks ? 'new' : 'cart',
      searchResults: [],
      togglingCurrentInCart: false,
      selectedCartId: props.carts[0].id,
      requestNotificationSearch: '',
      nextDoubleClickStarted: false,
      playPauseDoubleClickStarted: false
    }

    this.preview = React.createRef()
  }

  componentDidMount() {
    const that = this
    document.addEventListener('keydown', event => {
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
            this.playNextTrack()
            break
          case 'q':
            this.playPreviousTrack()
            break
          case 'w':
            that.preview.current.togglePlaying()
            break
          case 'r':
            this.playNextUnheard()
            break
          case 'd':
            this.seek(this.getSeekDistance())
            break
          case 'a':
            this.seek(-this.getSeekDistance())
            break
          case 'p':
            this.toggleCurrentInCart()
            break
          default:
        }
      }
    })
    if (this.props.carts.length !== 0 && !Number.isNaN(this.props.initialPosition)) {
      const currentTrack = this.props.carts[0].tracks[this.props.initialPosition - 1]
      this.setCurrentTrack(currentTrack)
    }
  }

  async setCurrentTrack(track) {
    this.setState({ currentTrack: track })
    document.title = `${trackArtistsAndTitle(track)} - Fomo Player`

    if (this.props.mode === 'app') {
      await requestWithCredentials({
        path: `/me/tracks/${track.id}`,
        method: 'POST',
        body: { heard: true }
      })
    }
    this.markHeard(track)
  }

  markHeard(track) {
    if (this.state.listState === 'heard') {
      return
    }

    let updatedHeardTracks = this.state.heardTracks
    const updatedTrack = R.assoc('heard', true, track)
    const playedTrackIndex = this.state.heardTracks.findIndex(R.propEq('id', track.id))
    if (playedTrackIndex !== -1) {
      updatedHeardTracks.splice(playedTrackIndex, 1)
    } else {
      this.setState({ listenedTracks: this.state.listenedTracks + 1 })
    }

    updatedHeardTracks = R.prepend(updatedTrack, updatedHeardTracks)
    this.setState({ heardTracks: updatedHeardTracks })
  }

  getCurrentTrackIndex() {
    return this.getTrackIndex(this.state.currentTrack)
  }

  getTrackIndex(track) {
    return R.findIndex(R.propEq('id', track.id), this.getTracks())
  }

  async jumpTracks(numberOfTracksToJump) {
    const currentTrackIndex = this.getCurrentTrackIndex()
    const indexToJumpTo = R.clamp(0, this.getTracks().length - 1, currentTrackIndex + numberOfTracksToJump)
    await this.setCurrentTrack(this.getTracks()[indexToJumpTo])
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
    const preview = this.state.currentTrack.previews.find(R.propEq('url', this.preview.current.state.previewUrl))

    return ((preview ? preview.length_ms : this.state.currentTrack.duration) / 5 / 1000) | 7
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

  async followArtist(artistId, follow) {
    await requestWithCredentials({
      path: `/me/follows/artists/${follow ? '' : artistId}`,
      method: follow ? 'POST' : 'DELETE',
      body: follow ? [artistId] : undefined,
      headers: {
        'content-type': 'application/vnd.multi-store-player.artist-ids+json;ver=1'
      }
    })

    await this.props.onFollow()
  }

  async followLabel(labelId, follow) {
    await requestWithCredentials({
      path: `/me/follows/labels/${follow ? '' : labelId}`,
      method: follow ? 'POST' : 'DELETE',
      body: follow ? [labelId] : undefined,
      headers: {
        'content-type': 'application/vnd.multi-store-player.label-ids+json;ver=1'
      }
    })

    await this.props.onFollow()
  }

  // TODO: change to POST {ignore: true} /me/labels/?
  async ignoreArtistsByLabels(artistId, labelIds, ignore) {
    await requestWithCredentials({
      path: `/me/ignores/artists-on-labels`,
      method: ignore ? 'POST' : 'DELETE',
      body: { artistIds: [artistId], labelIds }
    })
  }

  async ignoreArtist(artistId) {
    await requestWithCredentials({
      path: `/me/ignores/artists`,
      method: 'POST',
      body: [artistId]
    })
  }

  async ignoreLabel(labelId) {
    await requestWithCredentials({
      path: `/me/ignores/labels`,
      method: 'POST',
      body: [labelId]
    })
  }

  async ignoreRelease(releaseId) {
    await requestWithCredentials({
      path: `/me/ignores/releases`,
      method: 'POST',
      body: [releaseId]
    })
  }

  setListState(listState) {
    this.setState({ listState })
  }

  setSearchResults(searchResults) {
    this.setState({ searchResults })
  }

  selectCart(selectedCartId) {
    this.setState({ selectedCartId: selectedCartId })
  }

  mergeHeardStatus(tracks) {
    this.state.heardTracks.forEach(heardTrack => {
      const index = tracks.findIndex(R.propEq('id', parseInt(heardTrack.id, 10)))
      if (index !== -1) {
        tracks[index] = heardTrack
      }
    })
  }

  getTracks() {
    let tracks

    if (this.state.listState === 'new') {
      tracks = this.props.tracks.new.slice()
    } else if (this.state.listState === 'heard') {
      tracks = this.state.heardTracks
    } else if (this.state.listState === 'recentlyAdded') {
      tracks = this.props.tracks.recentlyAdded.slice()
    } else if (this.state.listState === 'cart') {
      tracks = this.props.carts.find(R.propEq('id', this.state.selectedCartId)).tracks
    } else if (this.state.listState === 'search') {
      tracks = this.state.searchResults
    }
    this.mergeHeardStatus(tracks)

    return tracks
  }

  setFollowPopupOpen(open) {
    this.setState({ followPopupOpen: open })
  }

  openFollowPopup(track) {
    this.setState({ followPopupTrack: track })
    this.setFollowPopupOpen(true)
  }

  setIgnorePopupOpen(open) {
    this.setState({ ignorePopupOpen: open })
  }

  openIgnorePopup(track) {
    this.setState({ ignorePopupTrack: track })
    this.setIgnorePopupOpen(true)
  }

  closePopups() {
    this.setFollowPopupOpen(false)
    this.setIgnorePopupOpen(false)
  }

  async refreshListAndClosePopups() {
    await this.props.onUpdateTracksClicked()
    this.closePopups()
  }

  getCurrentTrack() {
    return this.state.currentTrack
  }

  async toggleCurrentInCart() {
    this.setState({ togglingCurrentInCart: true })
    await (this.isCurrentInCart() ? this.props.onRemoveFromCart : this.props.onAddToCart)(
      this.getDefaultCart().id,
      this.state.currentTrack.id
    )
    this.setState({ togglingCurrentInCart: false })
  }

  isCurrentInCart() {
    const currentTrack = this.getCurrentTrack()
    return currentTrack && this.getDefaultCart()
      ? this.getDefaultCart().tracks.find(R.propEq('id', currentTrack.id))
      : null
  }

  getDefaultCart() {
    return this.props.carts.find(R.prop('is_default'))
  }

  async handlePlayPauseToggle(playing) {
    if (playing && this.state.playPauseDoubleClickStarted) {
      this.setState({ playPauseDoubleClickStarted: false })
      await this.props.onAddToCart(this.getDefaultCart().id, this.state.currentTrack.id)
    } else if (!playing) {
      const that = this
      this.setState({ playPauseDoubleClickStarted: true })
      setTimeout(() => {
        that.setState({ playPauseDoubleClickStarted: false })
      }, 200)
    }
  }

  render() {
    const tracks = this.getTracks()
    const currentTrack = this.getCurrentTrack()
    return (
      <div className="page-container">
        {this.props.follows ? (
          <FollowPopup
            open={this.state.followPopupOpen}
            track={this.state.followPopupTrack}
            follows={this.props.follows}
            onCloseClicked={this.closePopups.bind(this)}
            onFollowArtist={this.followArtist.bind(this)}
            onFollowLabel={this.followLabel.bind(this)}
            onRefreshAndCloseClicked={this.refreshListAndClosePopups.bind(this)}
          />
        ) : null}
        <IgnorePopup
          open={this.state.ignorePopupOpen}
          track={this.state.ignorePopupTrack}
          onCloseClicked={this.closePopups.bind(this)}
          onIgnoreArtistOnLabels={this.ignoreArtistsByLabels.bind(this)}
          onIgnoreArtist={this.ignoreArtist.bind(this)}
          onIgnoreLabel={this.ignoreLabel.bind(this)}
          onIgnoreRelease={this.ignoreRelease.bind(this)}
          onRefreshAndCloseClicked={this.refreshListAndClosePopups.bind(this)}
        />
        <MediaSession
          title={currentTrack ? trackTitle(currentTrack) : ''}
          artist={currentTrack ? artistNamesToString(currentTrack.artists) : ''}
          onSeekBackward={() => console.log('seek backward')}
          onSeekForward={() => console.log('seek forward')}
          onPreviousTrack={() => this.handlePreviousClick()}
          onNextTrack={() => this.handleNextClick()}
        />
        <Preview
          key={'preview'}
          mode={this.props.mode}
          togglingCurrentInCart={this.state.togglingCurrentInCart}
          showHint={tracks.length === 0}
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
        />
        <Tracks
          key={'tracks'}
          mode={this.props.mode}
          carts={this.props.carts}
          notifications={this.props.notifications}
          selectedCart={this.props.carts?.find(({ id }) => id === this.state.selectedCartId)}
          tracks={tracks}
          listState={this.state.listState}
          currentTrack={(currentTrack || {}).id}
          processingCart={this.props.processingCart}
          follows={this.props.follows}
          onFollow={this.props.onFollow}
          onUpdateTracksClicked={this.props.onUpdateTracksClicked}
          onAddToCart={this.props.onAddToCart}
          onRemoveFromCart={this.props.onRemoveFromCart}
          onMarkPurchased={this.props.onMarkPurchased}
          onIgnoreArtistsByLabels={this.ignoreArtistsByLabels}
          onPreviewRequested={id => {
            const requestedTrack = R.find(R.propEq('id', id), this.getTracks())
            this.setCurrentTrack(requestedTrack)
          }}
          onFollowClicked={this.openFollowPopup.bind(this)}
          onIgnoreClicked={this.openIgnorePopup.bind(this)}
          onShowNewClicked={this.setListState.bind(this, 'new')}
          onShowHeardClicked={this.setListState.bind(this, 'heard')}
          onShowRecentlyAddedClicked={this.setListState.bind(this, 'recentlyAdded')}
          onShowCartClicked={this.setListState.bind(this, 'cart')}
          onShowSearchClicked={this.setListState.bind(this, 'search')}
          onSearchResults={this.setSearchResults.bind(this)}
          onSelectCart={this.selectCart.bind(this)}
          onRequestNotification={this.props.onRequestNotification}
          onRemoveNotification={this.props.onRemoveNotification}
        />
      </div>
    )
  }
}

export default Player
