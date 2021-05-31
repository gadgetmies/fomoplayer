import Preview from './Preview.js'
import Tracks from './Tracks.js'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials.js'
import React, { Component } from 'react'
import * as R from 'ramda'
import MediaSession from '@mebtte/react-media-session'
import { artistNamesToString } from './TrackTitle'

class Player extends Component {
  constructor(props) {
    super(props)

    this.state = {
      currentTrack: null,
      heardTracks: [],
      listenedTracks: 0,
      listState: 'new'
    }

    this.preview = React.createRef()

    // if (this.props.tracks.length !== 0) {
    //   const storedTrack = JSON.parse(localStorage.getItem('currentTrack') || '{}')
    //   const currentTrack = storedTrack.track_id && this.props.tracks.find(R.propEq('track_id', storedTrack.track_id)) ||
    //     this.props.tracks[0]
    //   this.setCurrentTrack(currentTrack)
    // }
  }

  componentDidMount() {
    const that = this
    document.addEventListener('keydown', event => {
      console.log(event.target instanceof HTMLInputElement)
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
          default:
        }
      }
    })
  }

  async setCurrentTrack(track) {
    localStorage.setItem('currentTrack', JSON.stringify(track))
    this.setState({ currentTrack: track })
    await requestWithCredentials({
      path: `/me/tracks/${track.id}`,
      method: 'POST',
      body: { heard: true }
    })
    this.markAsPlayed(track.id)
  }

  markAsPlayed(trackId) {
    if (this.state.listState !== 'new') {
      return
    }

    let updatedHeardTracks = this.state.heardTracks
    const updatedTrack = R.assoc('heard', true, this.props.tracks.new.find(R.propEq('id', trackId)))
    const playedTrackIndex = this.state.heardTracks.findIndex(R.propEq('id', trackId))
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

  jumpTracks(numberOfTracksToJump) {
    const currentTrackIndex = this.getCurrentTrackIndex()
    const indexToJumpTo = R.clamp(0, this.getTracks().length - 1, currentTrackIndex + numberOfTracksToJump)
    this.setCurrentTrack(this.getTracks()[indexToJumpTo])
  }

  playPreviousTrack() {
    this.jumpTracks(-1)
  }

  playNextTrack() {
    this.jumpTracks(1)
  }

  seek(offset) {
    this.preview.current.scan(offset)
  }

  getSeekDistance() {
    const preview = this.state.currentTrack.previews.find(R.propEq('url', this.preview.current.state.previewUrl))

    return ((preview ? preview.length_ms : this.state.currentTrack.duration) / 5 / 1000) | 7
  }

  handleNextClick() {
    if (this.state.nextDoubleClickStarted) {
      this.setState({ nextDoubleClickStarted: false })
      this.playNextTrack()
    } else {
      this.setState()
      const that = this
      this.setState({ nextDoubleClickStarted: true })
      setTimeout(() => {
        that.setState({ nextDoubleClickStarted: false })
      }, 200)
      this.seek(this.getSeekDistance())
    }
  }

  handlePreviousClick() {
    if (this.state.previousDoubleClickStarted) {
      this.setState({ previousDoubleClickStarted: false })
      this.playPreviousTrack()
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

  playNextUnheard() {
    const firstUnplayed = this.getTracks().findIndex(R.propSatisfies(R.isNil, 'heard'))
    this.jumpTracks(firstUnplayed - this.getCurrentTrackIndex())
  }

  setPlaying(playing) {
    this.preview.current.setPlaying(playing)
  }

  // TODO: change to POST {ignore: true} /me/labels/?
  async ignoreArtistsByLabels(artistsAndLabels) {
    await requestWithCredentials({
      path: `/me/ignores/labels`,
      method: 'POST',
      body: artistsAndLabels
    })
  }

  setListState(listState) {
    this.setState({ listState })
  }

  setSearchResults(searchResults) {
    this.setState({ searchResults })
  }

  getTracks() {
    if (this.state.searchResults) {
      return this.state.searchResults
    }

    const heardTracks = this.state.heardTracks
    let tracks

    if (this.state.listState === 'new') {
      tracks = this.props.tracks.new.slice()
      heardTracks.forEach(heardTrack => {
        const index = tracks.findIndex(R.propEq('id', parseInt(heardTrack.id, 10)))
        if (index !== -1) {
          tracks[index] = heardTrack
        }
      })
    } else if (this.state.listState === 'heard') {
      tracks = this.props.tracks.heard.slice()
      heardTracks.forEach(heardTrack => {
        const index = tracks.findIndex(R.propEq('id', parseInt(heardTrack.id, 10)))
        if (index !== -1) {
          tracks.splice(index, 1)
        }
      })
      tracks = this.state.heardTracks.concat(tracks)
    } else if (this.state.listState === 'cart') {
      tracks = this.props.carts.find(R.prop('is_default')).tracks
    }

    return tracks
  }

  render() {
    const tracks = this.getTracks()
    const currentTrack = this.state.currentTrack
    return (
      <>
        <MediaSession
          title={currentTrack ? currentTrack.title : ''}
          artist={currentTrack ? artistNamesToString(currentTrack.artists) : ''}
          onPlay={() => this.setPlaying(true)}
          onPause={() => this.setPlaying(false)}
          onSeekBackward={() => console.log('seek backward')}
          onSeekForward={() => console.log('seek forward')}
          onPreviousTrack={() => this.handlePreviousClick()}
          onNextTrack={() => this.handleNextClick()}
        />
        <Preview
          key={'preview'}
          showHint={tracks.length === 0}
          currentTrack={currentTrack}
          onPrevious={() => this.playPreviousTrack()}
          onNext={() => this.playNextTrack()}
          ref={this.preview}
        />
        <Tracks
          key={'tracks'}
          carts={this.props.carts}
          tracks={tracks}
          listState={this.state.listState}
          newTracks={this.props.newTracks - this.state.listenedTracks}
          totalTracks={this.props.totalTracks}
          currentTrack={(currentTrack || {}).id}
          onMarkAllHeardClicked={this.props.onMarkAllHeardClicked}
          onUpdateTracksClicked={this.props.onUpdateTracksClicked}
          onAddToCart={this.props.onAddToCart}
          onRemoveFromCart={this.props.onRemoveFromCart}
          onIgnoreArtistsByLabels={this.ignoreArtistsByLabels}
          onPreviewRequested={id => {
            const requestedTrack = R.find(R.propEq('id', id), this.getTracks())
            this.setCurrentTrack(requestedTrack)
            this.setPlaying(true)
          }}
          onShowNewClicked={this.setListState.bind(this, 'new')}
          onShowHeardClicked={this.setListState.bind(this, 'heard')}
          onShowCartClicked={this.setListState.bind(this, 'cart')}
          onSearchResults={this.setSearchResults.bind(this)}
        />
      </>
    )
  }
}

export default Player
