import React, { Component } from 'react'
import * as R from 'ramda'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import * as L from 'partial.lenses'
import './Preview.css'
import Progress from './Progress.jsx'
import WaveformGenerator from 'waveform-generator-web'
import { requestWithCredentials } from './request-json-with-credentials'
import Collection from './Collection'
import Spinner from './Spinner'
import StoreIcon from './StoreIcon'
import { followableNameLinks, namesToString, trackArtistsAndTitle } from './trackFunctions'
import CopyToClipboardButton from './CopyToClipboardButton'
import ShareLink from './ShareLink'
import DropDownButton from './DropDownButton'
import PushButton from './PushButton'
import { NavLink } from 'react-router-dom'

const safePropEq = (prop, value) => R.pipe(R.defaultTo({}), R.propEq(prop, value))

class Preview extends Component {
  constructor(props) {
    super(props)

    this.state = {
      playing: false,
      position: 0,
      mp3Preview: undefined,
      waveform: undefined,
      totalDuration: undefined,
      previewUrl: undefined,
      volume: 100,
      newCartName: '',
      preferFullTracks: localStorage.getItem('preferFullTracks') === 'true',
      nextDoubleClickStarted: false,
      previousDoubleClickStarted: false,
    }
    if (window.AudioContext !== undefined) {
      this.audioContext = new AudioContext()
    }

    this.setVolume = this.setVolume.bind(this)

    const actionHandlers = [
      ['play', this.setPlaying.bind(this, true)],
      ['pause', this.setPlaying.bind(this, false)],
      ['previoustrack', this.handlePreviousClick.bind(this)],
      ['nexttrack', this.handleNextClick.bind(this)],
      ['stop', this.setPlaying.bind(this, false)],
      ['seekbackward', ({ seekOffset }) => this.scan.bind(this, -seekOffset)],
      ['seekforward', ({ seekOffset }) => this.scan.bind(this, seekOffset)],
      [
        'seekto',
        ({ seekTime }) => {
          this.getPlayer().currentTime = seekTime
        },
      ],
    ]

    for (const [action, handler] of actionHandlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch (error) {
        console.log(`The media session action "${action}" is not supported yet.`)
      }
    }
  }

  setPlaying(playing) {
    this.setState({ playing })
    this.props.onPlayPauseToggle(playing)
  }

  togglePlaying() {
    this.setState({ playing: !this.state.playing })
  }

  getPlayer() {
    return this.refs['player0']
  }

  async updateTrack(track, preview) {
    this.setState({
      position: 0,
      waveform: undefined,
      totalDuration: undefined,
      mp3Preview: preview,
      previewUrl: undefined,
    })

    let url = preview.url
    if (url === null) {
      url = await this.fetchPreviewUrl(preview)
    }

    this.setState({ previewUrl: url })
    const waveform = preview.waveforms[0] || this.getWaveform(track)
    if ((!waveform || preview.start_ms === null) && this.audioContext && preview.store !== 'bandcamp') {
      await this.updateWaveform(preview.url)
    } else {
      this.setState({ waveform })
    }
  }

  async fetchPreviewUrl(preview) {
    const res = await requestWithCredentials({ path: `/stores/${preview.store}/previews/${preview.id}` })
    const { url } = await res.json()
    return url
  }

  // TODO: replace componentWillUpdate with something that is supported. componentDidUpdate does not work: E.g. changing track causes the previous track to be played. Maybe getDerivedStateFromProps (suggested by co-pilot)?
  async componentWillUpdate({ currentTrack: nextTrack }, { playing }) {
    if (this.state.playing !== playing) {
      const player = this.getPlayer()
      if (player) {
        try {
          await player[playing ? 'play' : 'pause']()
        } catch (e) {
          console.error('Unable to set playback status', e)
          this.setState({ playing: false })
        }
      }
    }

    if (this.props.currentTrack !== nextTrack) {
      this.setState({ loading: true })
      try {
        const preview = this.getFirstMp3Preview(nextTrack, this.state.preferFullTracks)
        await this.updateTrack(nextTrack, preview)
      } catch (e) {
        console.error(e)
      }
      this.setState({ loading: false, playing: true })
    }
  }

  getFirstMp3Preview(track, preferFullTracks = false) {
    return L.get(
      [
        'previews',
        L.choices(
          [
            L.filter(({ store }) => (preferFullTracks ? store === 'bandcamp' : store !== 'bandcamp')),
            L.ifElse(R.isEmpty, L.zero, []),
          ],
          [],
        ),
        L.satisfying(safePropEq('format', 'mp3')),
      ],
      track,
    )
  }

  getWaveform(track) {
    return this.getFirstMp3Preview(track, this.state.preferFullTracks).waveforms[0]
  }

  async updateWaveform(previewUrl) {
    try {
      const blob = await fetch(previewUrl).then((r) => r.blob())
      const fileArrayBuffer = await blob.arrayBuffer()
      const waveformGenerator = new WaveformGenerator(fileArrayBuffer)
      const pngWaveformURL = await waveformGenerator.getWaveform({
        waveformWidth: 1024,
        waveformHeight: 170,
        waveformColor: '#cbcbcb',
      })

      const audioBuffer = await this.audioContext.decodeAudioData(fileArrayBuffer)
      this.setState({ waveform: pngWaveformURL, totalDuration: audioBuffer.duration * 1000 })
    } catch (e) {
      console.error(e)
    }
  }

  setVolume(volume) {
    this.setState({ volume: volume * 100 })
    this.getPlayer().volume = volume
  }

  scan(step) {
    this.getPlayer().currentTime = this.getPlayer().currentTime + step
  }

  play() {
    this.setPlaying(true)
    this.getPlayer().play()
    navigator.mediaSession.metadata = null
    navigator.mediaSession.playbackState = 'playing'
    navigator.mediaSession.metadata = new MediaMetadata({
      artist: `${namesToString(this.props.currentTrack.artists)}`,
      title: this.props.currentTrack.title,
    })
  }

  seekBackward() {
    this.scan(-this.getSeekDistance())
  }

  seekForward() {
    this.scan(this.getSeekDistance())
  }

  async handleNextClick() {
    if (this.state.nextDoubleClickStarted) {
      this.setState({ nextDoubleClickStarted: false })
      await this.props.onNext()
    } else {
      const that = this
      this.setState({ nextDoubleClickStarted: true })
      setTimeout(() => {
        that.setState({ nextDoubleClickStarted: false })
      }, 200)
      this.seekForward()
    }
  }

  async handlePreviousClick() {
    if (this.state.previousDoubleClickStarted) {
      this.setState({ previousDoubleClickStarted: false })
      await this.props.onPrevious()
    } else {
      const that = this
      this.setState({ previousDoubleClickStarted: true })
      setTimeout(() => {
        that.setState({ previousDoubleClickStarted: false })
      }, 200)
      this.seekBackward()
    }
  }

  getShouldSkip() {
    const mp3Preview = this.state.mp3Preview
    const isLongPreview = mp3Preview && mp3Preview.end_ms - mp3Preview.start_ms > 130000
    return !this.state.preferFullTracks && isLongPreview
  }

  getPreviewDetails() {
    return this.state.mp3Preview
      ? this.getShouldSkip()
        ? {
            length_ms: this.state.mp3Preview.length_ms * 0.4,
            start_ms: Math.max(this.state.mp3Preview.start_ms, this.state.mp3Preview.length_ms * 0.3),
            end_ms: Math.min(this.state.mp3Preview.end_ms, this.state.mp3Preview.length_ms * 0.7),
          }
        : {
            length_ms: this.state.mp3Preview.length_ms,
            start_ms: this.state.mp3Preview.start_ms,
            end_ms: this.state.mp3Preview.end_ms,
          }
      : null
  }

  getSeekDistance() {
    if (!this.props.currentTrack) return -1
    const previewDetails = this.getPreviewDetails()

    return ((previewDetails ? previewDetails.length_ms : this.props.currentTrack.duration) / 5 / 1000) | 7
  }

  render() {
    const currentTrack = this.props.currentTrack
    const mp3Preview = this.state.mp3Preview
    const waveform = this.state.waveform
    let totalDuration = 0
    let startOffset = 0
    let endPosition = 0
    const previewDetails = this.getPreviewDetails()
    const shouldSkip = this.getShouldSkip()

    const toPositionPercent = (currentPosition) =>
      previewDetails ? ((currentPosition + (shouldSkip ? 0 : previewDetails.start_ms)) / totalDuration) * 100 : 0

    if (currentTrack && mp3Preview) {
      totalDuration = this.state.totalDuration || currentTrack.duration
      startOffset = previewDetails?.start_ms || 0
      endPosition = previewDetails?.end_ms || this.state.totalDuration
    }

    const searchString = currentTrack
      ? encodeURIComponent(
          `${currentTrack.artists.map(R.prop('name')).join(' ')} ${currentTrack.title}${
            currentTrack.version ? ` ${currentTrack.version}` : ''
          }`,
        )
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
      : ''

    const selectedCart = this.props.selectedCart
    const cartLink = new URL(`/carts/${selectedCart?.uuid}`, window.location).toString()
    const cartName = selectedCart?.name

    const artistsAndRemixers = R.uniq([currentTrack?.artists, currentTrack?.remixers].flat())
    const title = `${currentTrack?.title} ${currentTrack?.version ? `(${currentTrack?.version})` : ''}`

    const [shareLabel, shareContent, shareLink] =
      this.props.listState === 'carts' || this.props.mode === 'list'
        ? [
            'Copy cart link to clipboard',
            `Listen to "${namesToString(
              artistsAndRemixers,
            )} - ${title}" in "${cartName}" on Fomo Player: ${`${cartLink}#${
              this.props.selectedCart?.tracks?.findIndex(({ id }) => id === this.props.currentTrack?.id) + 1
            }`}`,
            'https://fomoplayer.com',
          ]
        : [
            'Copy store links to clipboard',
            `Listen to "${namesToString(artistsAndRemixers)} - ${title}" on\n${currentTrack?.stores
              .map((store) => `${store.name}: ${store.url || store.release.url}`)
              .join('\n')}`,
            'https://fomoplayer.com',
          ]

    const previews = currentTrack?.previews?.filter(({ store }) => store !== 'bandcamp') || []
    const spotifyAuthorization = this.state.authorizations?.find(R.propEq('store_name', 'Spotify'))
    const fullTracks = currentTrack?.previews?.filter(({ store }) =>
      ['bandcamp', ...[spotifyAuthorization ? ['spotify'] : []]].includes(store),
    )

    const edgeOverlayClass = shouldSkip ? 'waveform_clip-edge-overlay-skip' : 'waveform_clip-edge-overlay'
    return (
      <div className="preview noselect">
        <div className="preview_details_wrapper">
          {this.props.currentTrack ? (
            <>
              <div style={{ marginTop: '0' }} className="preview_title">
                {trackArtistsAndTitle(this.props.currentTrack, this.props.follows)}
              </div>
              <div style={{ display: 'flex', gap: 8, flex: 1 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ fontSize: '75%' }}>
                      <span className="preview_label">Labels:</span>{' '}
                      <span className="preview_detail">
                        {!this.props.currentTrack.labels?.length
                          ? null
                          : followableNameLinks(this.props.currentTrack.labels, this.props.follows, 'label')}
                      </span>
                      <br />
                      <span className="preview_label">Released:</span>{' '}
                      <span className="preview_detail" style={{ whiteSpace: 'nowrap' }}>
                        {this.props.currentTrack.released}
                      </span>
                      <br />
                      <span className="preview_label">Published:</span>{' '}
                      <span className="preview_detail" style={{ whiteSpace: 'nowrap' }}>
                        {this.props.currentTrack.published}
                      </span>
                      <br />
                      <span className="preview_label">Releases:</span>{' '}
                      <span className="preview_detail">
                        {!this.props.currentTrack.releases?.length
                          ? null
                          : followableNameLinks(this.props.currentTrack.releases, [], 'release')}
                      </span>
                    </div>
                    <div style={{ fontSize: '75%' }}>
                      <span className="preview_label">Genre:</span>{' '}
                      <span className="preview_detail">
                        {this.props.currentTrack.genres?.map(R.prop('name')).filter(R.identity).join(', ') || '-'}
                      </span>
                      <br />
                      <span className="preview_label">BPM:</span>{' '}
                      <span className="preview_detail">
                        {this.props.currentTrack.stores
                          .map(R.prop('bpm'))
                          .filter(R.identity)
                          .map(Math.round)
                          .join(', ') || '-'}
                      </span>
                      <br />
                      <span className="preview_label">Key:</span>{' '}
                      <span className="preview_detail">
                        {this.props.currentTrack.keys?.length
                          ? Object.entries(R.groupBy(R.prop('id'), this.props.currentTrack.keys))
                              .map(([_id, keys]) => keys.map(R.prop('key')).join('/'))
                              .join(', ')
                          : '-'}
                      </span>
                      <br />
                      <span className="preview_label">Duration:</span>{' '}
                      <span className="preview_detail">
                        {new Date(Number(this.props.currentTrack.duration))
                          .toISOString()
                          .substring(11, 19)
                          .replace(/^00:/, '')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="preview_links_container">
                <div className="preview_links_wrapper">
                  <span className="preview_actions_title">Available&nbsp;on</span>
                  <div className="available_on_list">
                    {this.props.currentTrack?.stores.map(({ name, url, release: { url: releaseUrl } }) => (
                      <a
                        key={url || releaseUrl}
                        href={url || releaseUrl}
                        target="_blank"
                        className={'pill pill-small pill-link pill-link-large preview-pill_link pill-link-expand'}
                        style={{ display: 'flex', padding: '16px 8px' }}
                      >
                        <span className={`store-icon store-icon-${name.toLowerCase()}`} />{' '}
                        <span className="pill-link-text">{name}</span>
                        <FontAwesomeIcon icon={'square-arrow-up-right'} />
                      </a>
                    ))}
                  </div>
                </div>
                <div className="preview_links_wrapper" style={{ paddingBottom: 8 }}>
                  <span className="preview_actions_title">Search</span>
                  <div style={{ display: 'flex', gap: 4 }} className="search_from_list">
                    {this.props.stores
                      ?.filter(({ storeName }) =>
                        this.props.currentTrack?.stores.every(({ name }) => storeName !== name),
                      )
                      .map(({ storeName }) => {
                        const searchUrl = this.props.stores.find(R.propEq('storeName', storeName)).searchUrl
                        return (
                          <a
                            key={`${searchUrl}${searchString}`}
                            href={`${searchUrl}${searchString}`}
                            target="_blank"
                            className={'pill pill-small pill-link pill-link-large preview-pill_link pill-link-expand'}
                            style={{ display: 'flex', padding: '16px 8px' }}
                          >
                            <span className={`store-icon store-icon-${storeName.toLowerCase()}`} />{' '}
                            <span className="pill-link-text">{storeName}</span>
                            <FontAwesomeIcon icon={'square-arrow-up-right'} />
                          </a>
                        )
                      })}
                    <a
                      href={`https://www.youtube.com/results?search_query=${searchString}`}
                      target="_blank"
                      className={'pill pill-small pill-link pill-link-large preview-pill_link pill-link-expand'}
                      style={{ display: 'flex', padding: '16px 8px' }}
                    >
                      <FontAwesomeIcon icon={['fab', 'youtube']} /> <span className="pill-link-text">Youtube</span>
                      <FontAwesomeIcon icon={'square-arrow-up-right'} />
                    </a>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div>&nbsp;</div>
          )}
        </div>
        <div className="player-collection-wrapper" style={{ flex: 1, display: 'flex' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 8, marginBottom: 8 }}>
            <div className="preview-wrapper" style={{ position: 'relative' }}>
              <div
                className="waveform_container"
                style={{ flex: 5, position: 'relative' }}
                onMouseDown={(e) => {
                  if (e.button !== 0) return
                  const boundingRect = e.currentTarget.getBoundingClientRect()
                  const trackPositionPercent = (e.clientX - boundingRect.left) / e.currentTarget.clientWidth
                  const clickedPosition = totalDuration * trackPositionPercent
                  if (clickedPosition > endPosition || clickedPosition < startOffset) {
                    if (this.getShouldSkip()) {
                      this.setState({ preferFullTracks: true })
                    } else {
                      return
                    }
                  }
                  const previewPositionInSeconds = (clickedPosition - (this.getShouldSkip() ? 0 : startOffset)) / 1000
                  this.getPlayer().currentTime = previewPositionInSeconds
                }}
              >
                {waveform ? (
                  <img
                    alt="waveform"
                    src={waveform}
                    className="waveform waveform-background"
                    onDragStart={(e) => e.preventDefault()}
                  />
                ) : (
                  <div className="waveform waveform-background" />
                )}
                <div
                  className="waveform waveform-position"
                  style={{
                    WebkitClipPath: `polygon(${toPositionPercent(0)}% 0, ${toPositionPercent(
                      this.state.position,
                    )}% 0, ${toPositionPercent(this.state.position)}% 100%, ${toPositionPercent(0)}% 100%)`,
                    WebkitMaskImage: waveform ? `url(${waveform})` : 'none',
                  }}
                />
                <div
                  className={edgeOverlayClass}
                  style={{
                    width: `${toPositionPercent(shouldSkip ? startOffset : 0)}%`,
                    left: 0,
                  }}
                />
                <div
                  className={edgeOverlayClass}
                  style={{
                    width: `${100 - (100 * endPosition) / totalDuration}%`,
                    right: 0,
                  }}
                />
                {this.state.loading ? (
                  <div onMouseDown={(e) => e.stopPropagation()} className="loading-overlay">
                    <Spinner size="large" />
                  </div>
                ) : null}
              </div>
              <audio
                ref="player0"
                onEnded={async () => {
                  try {
                    navigator.mediaSession.playbackState = 'paused'
                    this.setState({ playing: false })
                    await this.props.onNext()
                  } catch (e) {
                    console.error(e)
                  }
                }}
                onLoadedData={() => {
                  this.setState({ playing: true })
                }}
                onPlay={async () => {
                  await this.props.markHeard(this.props.currentTrack)
                }}
                onPlaying={() => {
                  if (!shouldSkip && this.state.position === 0) {
                    this.play()
                  }
                }}
                onCanPlayThrough={() => {
                  if (shouldSkip && this.state.position === 0) {
                    this.setState({
                      position: previewDetails.start_ms,
                    })
                    this.getPlayer().currentTime = (previewDetails.start_ms - mp3Preview.start_ms) / 1000
                  }
                  this.play()
                }}
                onPause={() => this.setPlaying(false)}
                onTimeUpdate={({ currentTarget: { currentTime } }) => {
                  this.setState({ position: currentTime * 1000 })
                  try {
                    mp3Preview.length_ms &&
                      currentTime &&
                      currentTime < mp3Preview.length_ms / 1000 &&
                      navigator.mediaSession.setPositionState({
                        duration: mp3Preview.length_ms / 1000,
                        playbackRate: 1,
                        position: currentTime,
                      })
                    if (this.getShouldSkip() && currentTime * 1000 > previewDetails.end_ms) {
                      this.props.onNext()
                    }
                  } catch (e) {
                    console.error(e, currentTime, mp3Preview.length_ms)
                  }
                }}
                onError={async (e) => {
                  console.error('Audio error', e)
                  await requestWithCredentials({
                    url: '/log/error',
                    method: 'POST',
                    body: { message: 'Audio playback error', error: e },
                  })
                }}
                controlsList="nodownload"
                src={this.state.previewUrl}
              />
              {currentTrack ? (
                <>
                  <div
                    className={`preview-samples_container select-button select-button--container state-select-button--container noselect`}
                    style={{ left: 2 }}
                  >
                    <input
                      type="radio"
                      id="sample_select_state-preview"
                      name="sample-select-state"
                      checked={!this.state.preferFullTracks}
                    />
                    <label
                      htmlFor="sample_select_state-preview"
                      className={`select_button-button state-select_button-button select_button-button__small ${
                        !this.state.preferFullTracks ? 'select_button-button__active' : ''
                      }`}
                      onClick={() => {
                        localStorage.setItem('preferFullTracks', 'false')
                        this.setState({ preferFullTracks: false })
                      }}
                    >
                      Preview
                    </label>{' '}
                    {previews.length > 0 && (
                      <div className="preview-icons-container select-icon--container" style={{ left: 2 }}>
                        {previews
                          ?.reduce(
                            (acc, cur) => (acc.some(({ store }) => store === cur.store) ? acc : [...acc, cur]),
                            [],
                          )
                          .map(({ id, store }) => (
                            <span key={id} onMouseDown={(e) => e.stopPropagation()}>
                              <input
                                type="radio"
                                id={`preview-${id}`}
                                name="preview"
                                checked={this.state.mp3Preview?.id === id}
                                onChange={this.onPreviewStoreClicked.bind(this, id)}
                              />
                              <label className="select-icon--icon" htmlFor={`preview-${id}`}>
                                <StoreIcon code={store} />
                              </label>
                            </span>
                          ))}
                      </div>
                    )}
                  </div>

                  <div
                    className={`preview-samples_container select-button select-button--container state-select-button--container noselect`}
                    style={{ right: 2 }}
                  >
                    <input
                      type="radio"
                      id="sample_select_state-full_track"
                      name="sample-select-state"
                      checked={this.state.preferFullTracks}
                    />
                    <label
                      htmlFor="sample_select_state-full_track"
                      className={`select_button-button state-select_button-button select_button-button__small ${
                        this.state.preferFullTracks ? 'select_button-button__active' : ''
                      }`}
                      onClick={() => {
                        localStorage.setItem('preferFullTracks', 'true')
                        this.setState({ preferFullTracks: true })
                      }}
                    >
                      Listen
                    </label>{' '}
                    {fullTracks?.length > 0 && (
                      <div className="preview-icons-container select-icon--container">
                        {fullTracks
                          ?.reduce(
                            (acc, cur) => (acc.some(({ store }) => store === cur.store) ? acc : [...acc, cur]),
                            [],
                          )
                          .map(({ id, store }) => (
                            <span key={id} onMouseDown={(e) => e.stopPropagation()}>
                              <input
                                type="radio"
                                id={`preview-${id}`}
                                name="preview"
                                checked={this.state.mp3Preview?.id === id}
                                onChange={this.onPreviewStoreClicked.bind(this, id)}
                              />
                              <label className="select-icon--icon" htmlFor={`preview-${id}`}>
                                <StoreIcon code={store} />
                              </label>
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
            <div className="button-wrapper">
              <button className="button button-playback" onClick={() => this.togglePlaying()}>
                <FontAwesomeIcon icon={this.state.playing ? 'pause' : 'play'} />
              </button>
              <button className="button button-playback" onClick={() => this.props.onPrevious()}>
                <FontAwesomeIcon icon="step-backward" />
              </button>
              <button className="button button-playback" onClick={() => this.props.onNext()}>
                <FontAwesomeIcon icon="step-forward" />
              </button>
              <div className="preview_actions_wrapper">
                {this.props.mode !== 'app' ? null : this.props.togglingCurrentInCart ? (
                  <div
                    style={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: '0 9px 0 4px',
                    }}
                  >
                    <Spinner size="large" color="#5A5A5A" />
                  </div>
                ) : (
                  <>
                    <DropDownButton
                      label={!this.props.inCart ? 'Add to cart' : 'Remove from cart'}
                      title={!this.props.inCart ? 'Add to default cart' : 'Remove from default cart'}
                      icon={this.props.inCart ? 'minus' : 'cart-plus'}
                      loading={this.props.processingCart}
                      disabled={this.props.inCart === null || this.props.togglingCurrentInCart}
                      onClick={async () => {
                        await this.props.onToggleCurrentInCart()
                      }}
                      data-help-id="add-to-default-cart"
                      popupClassName="popup_content-small"
                      buttonClassName="preview-action_button"
                    >
                      <div
                        className={'carts-list'}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        {this.props.carts?.length === 0
                          ? 'Loading carts...'
                          : this.props.carts?.map(({ id, name }) => {
                              const isInCart = this.props.inCarts.find(R.propEq('id', id)) !== undefined
                              return (
                                <PushButton
                                  disabled={this.props.processingCart}
                                  styles="primary small"
                                  className="cart-button "
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    return this.props.onCartButtonClick(currentTrack.id, id, isInCart)
                                  }}
                                  key={`cart-${id}`}
                                  icon={isInCart ? 'minus' : 'cart-plus'}
                                  label={name}
                                />
                              )
                            })}
                        <hr className={'popup-divider'} />
                        <div className={'input-layout'}>
                          <input
                            placeholder={'New cart'}
                            style={{ flex: 1 }}
                            className={'cart-popup-input text-input text-input-small text-input-dark'}
                            value={this.state.newCartName}
                            onChange={(e) => this.setState({ newCartName: e.target.value })}
                          />
                          <button
                            className="button button-push_button button-push_button-small button-push_button-primary"
                            onClick={async () => {
                              this.setState({ newCartName: '' })
                              const { id: cartId } = await this.props.onCreateCartClick(this.state.newCartName)
                              await this.props.onCartButtonClick(cartId, false)
                            }}
                            disabled={this.state.newCartName === ''}
                          >
                            Create cart
                          </button>
                        </div>
                        {!this.props.selectedCartIsPurchased && (
                          <>
                            <hr className={'popup-divider'} />
                            <button
                              disabled={this.props.processingCart}
                              style={{ display: 'block', width: '100%', marginBottom: 4, whiteSpace: 'normal' }}
                              className="button button-push_button button-push_button-small button-push_button-primary"
                              onClick={(e) => {
                                e.stopPropagation()
                                return this.props.onMarkPurchasedButtonClick()
                              }}
                            >
                              Mark purchased and remove from carts
                            </button>
                          </>
                        )}
                        <div style={{ textAlign: 'center' }}>
                          <NavLink to={'/settings/carts'}>Manage carts in settings</NavLink>
                        </div>
                      </div>
                    </DropDownButton>
                  </>
                )}
                {this.props.mode === 'app' && (
                  <>
                    <button
                      disabled={!this.props.currentTrack}
                      onClick={this.props.onFollowClicked}
                      className={
                        'button button-push_button button-push_button-small button-push_button-primary preview-action_button'
                      }
                    >
                      <span className="button-push_button_icon">
                        <FontAwesomeIcon icon={'heart'} />
                      </span>{' '}
                      <span className="button-push_button_label">Follow</span>
                    </button>
                    <button
                      disabled={!this.props.currentTrack}
                      className={
                        'button button-push_button button-push_button-small button-push_button-primary preview-action_button'
                      }
                      onClick={() => {
                        this.props.onIgnoreClicked(this.props.currentTrack)
                      }}
                    >
                      <span className="button-push_button_icon">
                        <FontAwesomeIcon icon={'ban'} />
                      </span>{' '}
                      <span className="button-push_button_label">Ignore</span>
                    </button>
                  </>
                )}
                <div className="popup_container" style={{ display: 'flex' }}>
                  <button className={'pill pill-button button-push_button-small popup-anchor'} style={{ flex: 1 }}>
                    <span className="pill-button-contents">
                      <span className="button-push_button_icon">
                        <FontAwesomeIcon icon={'share'} />
                      </span>{' '}
                      <span className={'button-push_button_label'}>Share</span>
                      <span className="preview-share_caret">
                        <FontAwesomeIcon icon={'caret-down'} />
                      </span>
                    </span>
                  </button>
                  {currentTrack && (
                    <div
                      className={`popup_content popup_content-left share-popup_content`}
                      style={{ zIndex: 100, padding: '0.25rem' }}
                    >
                      <span
                        className="pill pill-small pill-button"
                        style={{ display: 'block', width: '100%', margin: 0, marginBottom: 4, padding: 0, border: 0 }}
                      >
                        <span className="pill-button-contents">
                          <CopyToClipboardButton
                            title={shareLabel}
                            label={shareLabel}
                            content={shareContent}
                            style={{ height: '2rem', width: '100%', padding: '0 4px', boxSizing: 'border-box' }}
                          />
                        </span>
                      </span>
                      <ShareLink
                        href={`https://telegram.me/share/url?url=${encodeURIComponent(
                          shareLink,
                        )}&text=${encodeURIComponent(shareContent)}`}
                        icon={<FontAwesomeIcon icon={['fab', 'telegram']} />}
                        label={'Share on Telegram'}
                      />
                      <ShareLink
                        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                          shareLink,
                        )}&t=${encodeURIComponent(shareContent)}`}
                        icon={<FontAwesomeIcon icon={['fab', 'facebook']} />}
                        label={'Share on Facebook'}
                      />
                      <ShareLink
                        href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(
                          shareLink,
                        )}&text=${encodeURIComponent(shareContent)}`}
                        icon={<FontAwesomeIcon icon={['fab', 'twitter']} />}
                        label={'Share on Twitter'}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
            {this.props.newTracks !== null && this.props.totalTracks !== null ? (
              <Collection newTracks={this.props.newTracks} totalTracks={this.props.totalTracks} />
            ) : null}
          </div>
          <Progress
            className="volume-slider"
            percent={this.state.volume}
            barColor="#b40089"
            bgColor="transparent"
            style={{ padding: '0 8px', boxSizing: 'border-box' }}
            vertical={false}
            onClick={(e) => {
              debugger
              this.setVolume(1 - (e.clientY - e.currentTarget.getBoundingClientRect().y) / e.currentTarget.clientHeight)
            }}
          />
        </div>
      </div>
    )
  }

  async onPreviewStoreClicked(id) {
    this.setState({ loading: true })
    try {
      const preview = this.props.currentTrack.previews.find(R.propEq('id', id))

      await this.updateTrack(this.props.currentTrack, preview)
      this.setState({ mp3Preview: preview, position: 0, loading: false })
    } catch (e) {
      console.error(e)
      this.setState({ loading: false })
    }
  }
}

export default Preview
