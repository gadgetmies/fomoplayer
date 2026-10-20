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
import { getWaveformTimeline } from './waveformTimeline'
import CopyToClipboardButton from './CopyToClipboardButton'
import ShareLink from './ShareLink'
import { CartDropDownButton } from './CartDropDownButton'
import Popup from './Popup'
import { apiURL, serviceURL } from './config'
import { search } from './events'
import { colors } from 'fomoplayer_shared/theme'
import { Link } from 'react-router-dom'
import { isSample } from './playQueue'
import {
  formatSeconds,
  formatTempo,
  hasAlignment,
  loopRegion,
  matchedAtInTrack,
  previewTimeForSampleTime,
  sampleTimeForPreviewTime,
} from './abTiming'

const safePropEq = (prop, value) => R.pipe(R.defaultTo({}), R.propEq(value, prop))

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
      cartFilter: '',
      embeddingMissing: true,
      // A sample match plays as an A/B pair (currentTrack.abPair): A is the sample, B the match's preview
      abSource: 'B',
      abLoop: true,
      abSampleDuration: undefined,
    }
    this._playPauseSource = undefined
    // Seconds to seek to once the newly loaded source can play (A/B switching)
    this._pendingSeek = null
    if (window.AudioContext !== undefined) {
      this.audioContext = new AudioContext()
    }

    this.setVolume = this.setVolume.bind(this)

    const actionHandlers = [
      ['play', () => this.setPlaying(true, 'media')],
      ['pause', () => this.setPlaying(false, 'media')],
      ['previoustrack', this.handlePreviousClick.bind(this)],
      ['nexttrack', this.handleNextClick.bind(this)],
      ['stop', () => this.setPlaying(false, 'media')],
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

  setPlaying(playing, source) {
    const sourceToUse = source || this._playPauseSource
    this._playPauseSource = undefined

    if (this.state.playing === playing && !sourceToUse) return

    this.setState({ playing })
    this.props.onPlayPauseToggle(playing, sourceToUse)
  }

  togglePlaying(source) {
    this._playPauseSource = source
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
    if (!url) {
      url = await this.fetchPreviewUrl(preview)
    }

    this.setState({ previewUrl: url })
    const waveform = preview.waveforms[0] || this.getWaveform(track)
    if ((!waveform || preview.start_ms === null) && this.audioContext && preview.store !== 'bandcamp' && url) {
      await this.updateWaveform(url)
    } else {
      this.setState({ waveform })
    }
  }

  async fetchPreviewUrl(preview) {
    const res = await requestWithCredentials({ path: `/stores/${preview.store}/previews/${preview.id}` })
    const { url } = await res.json()
    return url
  }

  async prefetchTrack(track) {
    if (!track) return
    const previews = this.getMp3Previews(track, this.state.preferFullTracks)
    for (const preview of previews) {
      if (preview.url === null || (preview.store === 'bandcamp' && !preview.url.includes('token='))) {
        try {
          await this.fetchPreviewUrl(preview)
        } catch (e) {
          console.error('Pre-fetch failed', e)
        }
      }
    }
  }
  async componentDidUpdate(prevProps, prevState) {
    if (this.props.nextTrack !== prevProps.nextTrack) {
      this.prefetchTrack(this.props.nextTrack)
    }

    if (prevState.playing !== this.state.playing) {
      const player = this.getPlayer()
      if (player) {
        try {
          await player[this.state.playing ? 'play' : 'pause']()
        } catch (e) {
          console.error('Unable to set playback status', e)
          this.setState({ playing: false })
        }
      }
    }

    // The same track played as a sample match (A/B pair) is a different item to play
    const playbackKey = (track) => (track ? `${track.id}|${track.abPair?.sampleId ?? ''}` : null)
    if (playbackKey(prevProps.currentTrack) !== playbackKey(this.props.currentTrack)) {
      const nextTrack = this.props.currentTrack
      if (!nextTrack) return
      this.setState({ loading: true, embeddingMissing: true })
      const abPair = nextTrack.abPair
      this._pendingSeek = hasAlignment(abPair) ? abPair.offsetSeconds : null
      this._bUrl = undefined
      this.setState({ abSource: 'B', abLoop: hasAlignment(abPair), abSampleDuration: undefined })
      if (abPair) {
        this.loadSampleDuration(abPair.sampleUrl)
        // Commit an empty source first: when B is the preview already loaded, setting the same URL again would not
        // reload the audio and the seek to the matched spot would never run
        await new Promise((resolve) => this.setState({ previewUrl: undefined }, resolve))
      }
      const candidates = this.getMp3Previews(nextTrack, this.state.preferFullTracks)
      // The match's offset is relative to the preview the sample matched, so B must be that preview
      const previews = abPair
        ? R.sortBy((preview) => (String(preview.id) === String(abPair.previewId) ? 0 : 1), candidates)
        : candidates
      console.log('[Preview] selecting preview', {
        trackId: nextTrack.id,
        previewCandidates: previews.length,
        storeSlugs: this.props.stores.map(({ storeName }) => storeName.toLowerCase()),
        firstPreview: previews[0] && {
          id: previews[0].id,
          store: previews[0].store,
          format: previews[0].format,
          hasUrl: Boolean(previews[0].url),
        },
      })

      let trackUpdated = false
      for (const preview of previews) {
        try {
          await this.updateTrack(nextTrack, preview)
          trackUpdated = true
          break
        } catch (e) {
          console.error('[Preview] updateTrack failed', e)
        }
      }

      this.setState({ loading: false, playing: trackUpdated })
      if (!trackUpdated) {
        console.warn('[Preview] no playable preview for track', nextTrack.id)
      }
    }

    if (prevState.previewUrl !== this.state.previewUrl) {
      const player = this.getPlayer()
      if (player) {
        player.currentTime = 0
        player.load()
      }
    }
  }

  getMp3Previews(track, preferFullTracks = false) {
    const storeSlugs = this.props.stores.map(({ storeName }) => storeName.toLowerCase())
    return L.collect(
      [
        'previews',
        L.choices(
          [
            L.normalize(R.sortBy(L.get(['length_ms', (l) => (preferFullTracks ? -l : l)]))),
            L.ifElse(R.isEmpty, L.zero, []),
          ],
          [],
        ),
        L.satisfying(safePropEq('format', 'mp3')),
        L.satisfying((preview) => preview && (preview.store === 'sample' || storeSlugs.includes(preview.store))),
      ],
      track,
    )
  }

  getFirstMp3Preview(track, preferFullTracks = false) {
    const storeSlugs = this.props.stores.map(({ storeName }) => storeName.toLowerCase())
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
        L.satisfying((preview) => preview && (preview.store === 'sample' || storeSlugs.includes(preview.store))),
      ],
      track,
    )
  }

  getWaveform(track) {
    const preview = this.getFirstMp3Preview(track, this.state.preferFullTracks)
    return preview?.waveforms?.[0]
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
    const behavior = localStorage.getItem('mediaButtonBehavior')
    if (behavior === 'skip') {
      await this.props.onNext()
    } else {
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
  }

  async handlePreviousClick() {
    const behavior = localStorage.getItem('mediaButtonBehavior')
    if (behavior === 'skip') {
      if (this.getPlayer().currentTime > 2) {
        this.getPlayer().currentTime = 0
      } else {
        await this.props.onPrevious()
      }
    } else {
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

  onCartFilterChange(_, inputValue) {
    this.setState({ cartFilter: inputValue })
  }

  onClearCartFilter() {
    this.setState({ cartFilter: '' })
  }

  loadSampleDuration(url) {
    const probe = new Audio()
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => {
      if (this.props.currentTrack?.abPair?.sampleUrl === url) this.setState({ abSampleDuration: probe.duration })
    }
    probe.src = url
  }

  // Switches between the sample (A) and the match (B), keeping the place: the matcher's alignment maps the time in
  // one onto the other.
  switchAbSource(target) {
    const pair = this.props.currentTrack?.abPair
    if (!pair || target === this.state.abSource) return
    const player = this.getPlayer()
    const time = player ? player.currentTime : 0
    if (target === 'A') {
      this._bUrl = this.state.previewUrl
      this._pendingSeek = sampleTimeForPreviewTime(pair, time, this.state.abSampleDuration)
      this.setState({ abSource: 'A', previewUrl: pair.sampleUrl, playing: true })
    } else {
      this._pendingSeek = previewTimeForSampleTime(pair, time)
      this.setState({ abSource: 'B', previewUrl: this._bUrl, playing: true })
    }
  }

  renderAbControls() {
    const currentTrack = this.props.currentTrack
    const pair = currentTrack?.abPair
    if (!pair) return null
    const aligned = hasAlignment(pair)
    const previewStartMs = currentTrack.previews?.find(({ id }) => String(id) === String(pair.previewId))?.start_ms ?? 0
    return (
      <div className="preview_ab">
        <div className="preview_ab-details">
          <span className="preview_label">Matched at:</span>{' '}
          <span className="preview_detail preview_ab-matched-at">
            {formatSeconds(matchedAtInTrack(pair.offsetSeconds, previewStartMs))}
          </span>{' '}
          · <span className="preview_label">Tempo:</span>{' '}
          <span className="preview_detail preview_ab-tempo">{formatTempo(pair.tempoFactor)}</span> ·{' '}
          <span className="preview_label">Sample:</span> <span className="preview_detail">{pair.sampleTitle}</span>
        </div>
        <div className="preview_ab-controls">
          <div role="group" aria-label="Play source" className="preview_ab-segmented">
            <button
              type="button"
              aria-pressed={this.state.abSource === 'A' ? 'true' : 'false'}
              className={this.state.abSource === 'A' ? 'preview_ab-option preview_ab-option--on' : 'preview_ab-option'}
              onClick={() => this.switchAbSource('A')}
            >
              A · Your sample
            </button>
            <button
              type="button"
              aria-pressed={this.state.abSource === 'B' ? 'true' : 'false'}
              className={this.state.abSource === 'B' ? 'preview_ab-option preview_ab-option--on' : 'preview_ab-option'}
              onClick={() => this.switchAbSource('B')}
            >
              B · Match
            </button>
          </div>
          <button
            type="button"
            aria-pressed={this.state.abLoop && aligned ? 'true' : 'false'}
            disabled={!aligned}
            className={`preview_ab-loop${this.state.abLoop && aligned ? ' preview_ab-loop--on' : ''}`}
            onClick={() => this.setState({ abLoop: !this.state.abLoop })}
          >
            Loop match
          </button>
          <span className="preview_ab-hint">
            {aligned
              ? 'Switching keeps your place: B plays from where the sample matched, at its tempo.'
              : 'Not aligned yet: B plays from the start of the preview.'}
          </span>
        </div>
      </div>
    )
  }

  // Seeks to the clicked spot of a waveform that spans the timeline (the panel's waveform or the docked bar's).
  seekFromWaveformClick(e, { totalDuration, startOffset, endPosition }) {
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
  }

  // The waveform with the played part highlighted and the parts outside the preview dimmed, sized by its container
  renderWaveformLayers({ waveform, toPositionPercent, shouldSkip, startOffset, endPosition, totalDuration }) {
    const edgeOverlayClass = shouldSkip ? 'waveform_clip-edge-overlay-skip' : 'waveform_clip-edge-overlay'
    return (
      <>
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
        <div className={edgeOverlayClass} style={{ width: `${toPositionPercent(shouldSkip ? startOffset : 0)}%`, left: 0 }} />
        <div className={edgeOverlayClass} style={{ width: `${100 - (100 * endPosition) / totalDuration}%`, right: 0 }} />
      </>
    )
  }

  renderPlayingFrom() {
    const source = this.props.playingFrom
    if (!source) return null
    return (
      <div className="preview_playing-from">
        <span className="preview_label">Playing from</span>{' '}
        <Link to={source.path} className="preview_playing-from-link">
          {source.label}
        </Link>
      </div>
    )
  }

  // The player on pages without a track list (Settings): a bar docked to the bottom of the viewport. The full panel,
  // with the one audio element, stays mounted but hidden so playback continues.
  renderDockedBar({ waveform, totalDuration, startOffset, endPosition, shouldSkip, toPositionPercent }) {
    const currentTrack = this.props.currentTrack
    // position is the audio element's time; without skipping, the preview starts startOffset into the timeline
    const timelineMs = this.state.position + (shouldSkip ? 0 : startOffset || 0)
    const formatTime = (ms) => {
      const seconds = Math.max(0, Math.floor(ms / 1000))
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    }
    return (
      <section className="docked-player" aria-label="Player">
        <div
          className="waveform_container docked-player_waveform"
          data-testid="docked-player-waveform"
          onMouseDown={(e) => this.seekFromWaveformClick(e, { totalDuration, startOffset, endPosition })}
        >
          {this.renderWaveformLayers({ waveform, toPositionPercent, shouldSkip, startOffset, endPosition, totalDuration })}
        </div>
        <div className="docked-player_row">
          <button
            type="button"
            className="button button-playback docked-player_button"
            aria-label={this.state.playing ? 'Pause' : 'Play'}
            onClick={() => this.togglePlaying('ui')}
          >
            <FontAwesomeIcon icon={this.state.playing ? 'pause' : 'play'} />
          </button>
          <button
            type="button"
            className="button button-playback docked-player_button"
            aria-label={`Previous${this.props.playingFrom ? ` in ${this.props.playingFrom.label}` : ''}`}
            onClick={() => this.props.onPrevious()}
          >
            <FontAwesomeIcon icon="step-backward" />
          </button>
          <button
            type="button"
            className="button button-playback docked-player_button"
            aria-label={`Next${this.props.playingFrom ? ` in ${this.props.playingFrom.label}` : ''}`}
            onClick={() => this.props.onNext()}
          >
            <FontAwesomeIcon icon="step-forward" />
          </button>
          <span className="docked-player_time" data-testid="docked-player-time">
            {formatTime(timelineMs)}
            {totalDuration ? ` / ${formatTime(totalDuration)}` : ''}
          </span>
          <div className="docked-player_info">
            <span className="docked-player_title">
              {isSample(currentTrack) ? (
                <>Your sample - {currentTrack.title}</>
              ) : (
                <>
                  <b>{namesToString(R.uniq([currentTrack.artists, currentTrack.remixers].flat()))}</b> -{' '}
                  {currentTrack.title}
                  {currentTrack.version ? ` (${currentTrack.version})` : ''}
                </>
              )}
            </span>
            {this.renderPlayingFrom()}
          </div>
        </div>
      </section>
    )
  }

  render() {
    const currentTrack = this.props.currentTrack
    const mp3Preview = this.state.mp3Preview
    const waveform = this.state.waveform
    const previewDetails = this.getPreviewDetails()
    const shouldSkip = this.getShouldSkip()
    const { totalDuration, startOffset, endPosition, toPositionPercent } = getWaveformTimeline({
      previewDetails: currentTrack ? previewDetails : null,
      trackDuration: currentTrack?.duration,
      generatedWaveformDuration: this.state.totalDuration,
      shouldSkip,
    })

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
              this.props.selectedCart?.tracks?.findIndex(({ id }) => id === currentTrack?.id) + 1
            }`}`,
            serviceURL,
          ]
        : [
            'Copy store links to clipboard',
            `Listen to "${namesToString(artistsAndRemixers)} - ${title}" on\n${currentTrack?.stores
              .map((store) => `${store.name}: ${store.url || store.release?.url}`)
              .join('\n')}`,
            serviceURL,
          ]

    const previews =
      currentTrack?.previews?.filter(({ store }) => store !== 'bandcamp' && this.props.stores.includes(store)) || []
    const spotifyAuthorization = this.state.authorizations?.find(R.propEq('Spotify', 'store_name'))
    const fullTracks = currentTrack?.previews?.filter(
      ({ store }) =>
        ['bandcamp', ...[spotifyAuthorization ? ['spotify'] : []]].includes(store) && this.props.stores.includes(store),
    )

    const trackId = currentTrack?.id
    const currentCartId = this.props.listState === 'carts' ? this.props.selectedCartId : this.props.defaultCartId
    const inCurrentCart = this.props.inCurrentCart
    const inDefaultCart = this.props.inDefaultCart
    const inCart = this.props.listState === 'carts' ? inCurrentCart : inDefaultCart
    const processingCart = this.props.processingCart
    const removeLabel = this.props.listState === 'carts' ? 'Remove from current cart' : 'Remove from default cart'

    const onCartFilterChange = this.onCartFilterChange.bind(this)
    const onClearCartFilter = this.onClearCartFilter.bind(this)
    const cartFilter = this.state.cartFilter

    const storeSlugs = this.props.stores.map(({ storeName }) => storeName.toLowerCase())
    const currentTrackStores = currentTrack?.stores.filter(({ code }) => storeSlugs.includes(code))
    return (
      <div
        className={`preview${this.props.docked ? ' preview--docked' : ''}`}
        style={{ borderBottom: '1px solid black' }}
      >
        {this.props.docked && currentTrack
          ? this.renderDockedBar({ waveform, totalDuration, startOffset, endPosition, shouldSkip, toPositionPercent })
          : null}
        <div className="preview_details_wrapper">
          {currentTrack ? (
            <>
              <div style={{ marginTop: '0' }} className="preview_title">
                {isSample(currentTrack) ? (
                  <>Your sample - {currentTrack.title}</>
                ) : (
                  trackArtistsAndTitle(currentTrack, this.props.follows, this.props.onAddEntityToSearch)
                )}
              </div>
              {this.renderPlayingFrom()}
              {this.renderAbControls()}
              <div style={{ display: 'flex', gap: 8, flex: 1 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ fontSize: '75%' }}>
                      <span className="preview_label">Labels:</span>{' '}
                      <span className="preview_detail">
                        {!currentTrack.labels?.length
                          ? null
                          : followableNameLinks(
                              currentTrack.labels,
                              this.props.follows,
                              'label',
                              ', ',
                              ' & ',
                              this.props.onAddEntityToSearch,
                            )}
                      </span>
                      <br />
                      <span className="preview_label">Released:</span>{' '}
                      <span className="preview_detail" style={{ whiteSpace: 'nowrap' }}>
                        {currentTrack.released}
                      </span>
                      <br />
                      <span className="preview_label">Published:</span>{' '}
                      <span className="preview_detail" style={{ whiteSpace: 'nowrap' }}>
                        {currentTrack.published}
                      </span>
                      <br />
                      <span className="preview_label">Releases:</span>{' '}
                      <span className="preview_detail">
                        {!currentTrack.releases?.length
                          ? null
                          : followableNameLinks(
                              currentTrack.releases,
                              [],
                              'release',
                              ', ',
                              ' & ',
                              this.props.onAddEntityToSearch,
                            )}
                      </span>
                    </div>
                    <div style={{ fontSize: '75%' }}>
                      <span className="preview_label">Genre:</span>{' '}
                      <span className="preview_detail">
                        {currentTrack.genres?.map(R.prop('name')).filter(R.identity).join(', ') || '-'}
                      </span>
                      <br />
                      <span className="preview_label">BPM:</span>{' '}
                      <span className="preview_detail">
                        {currentTrackStores.map(R.prop('bpm')).filter(R.identity).map(Math.round).join(', ') || '-'}
                      </span>
                      <br />
                      <span className="preview_label">Key:</span>{' '}
                      <span className="preview_detail">
                        {currentTrack.keys?.length
                          ? Object.entries(R.groupBy(R.prop('id'), currentTrack.keys))
                              .map(([_id, keys]) => keys.map(R.prop('key')).join('/'))
                              .join(', ')
                          : '-'}
                      </span>
                      <br />
                      <span className="preview_label">Duration:</span>{' '}
                      <span className="preview_detail">
                        {new Date(Number(currentTrack.duration)).toISOString().substring(11, 19).replace(/^00:/, '')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="preview_links_container">
                <div className="preview_links_wrapper">
                  <span className="preview_actions_title" style={{ whiteSpace: 'nowrap' }}>
                    {this.props.stores.length === 1 ? 'Open in store' : 'Available on'}
                  </span>
                  <div className="available_on_list">
                    {currentTrackStores?.map(({ name, url, release: { url: releaseUrl } }) => (
                      <a
                        key={url || releaseUrl}
                        href={url || releaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
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
                {this.props.stores.length !== 1 && (
                  <div className="preview_links_wrapper" style={{ paddingBottom: 8 }}>
                    <span className="preview_actions_title">Search</span>
                    <div style={{ display: 'flex', gap: 4 }} className="search_from_list">
                      {this.props.stores
                        ?.filter(({ storeName }) => currentTrackStores.every(({ name }) => storeName !== name))
                        .map(({ storeName, searchUrl }) => {
                          if (!searchUrl) return null
                          return (
                            <a
                              key={`${searchUrl}${searchString}`}
                              href={`${searchUrl}${searchString}`}
                              target="_blank"
                              rel="noopener noreferrer"
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
                        rel="noopener noreferrer"
                        className={'pill pill-small pill-link pill-link-large preview-pill_link pill-link-expand'}
                        style={{ display: 'flex', padding: '16px 8px' }}
                      >
                        <FontAwesomeIcon icon={['fab', 'youtube']} /> <span className="pill-link-text">Youtube</span>
                        <FontAwesomeIcon icon={'square-arrow-up-right'} />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div>&nbsp;</div>
          )}
        </div>
        <div className="player-collection-wrapper noselect" style={{ flex: 1, display: 'flex' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 8, marginBottom: 8 }}>
            <div className="preview-wrapper" style={{ position: 'relative' }}>
              <div
                className="waveform_container"
                style={{ flex: 5, position: 'relative' }}
                onMouseDown={(e) => this.seekFromWaveformClick(e, { totalDuration, startOffset, endPosition })}
              >
                {this.renderWaveformLayers({
                  waveform,
                  toPositionPercent,
                  shouldSkip,
                  startOffset,
                  endPosition,
                  totalDuration,
                })}
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
                    // The sample of an A/B pair ends on its own; next would leave the pair
                    if (currentTrack?.abPair && this.state.abSource === 'A') return
                    await this.props.onNext()
                  } catch (e) {
                    console.error(e)
                  }
                }}
                onPlay={async () => {
                  await this.props.markHeard(currentTrack.id)
                }}
                onPlaying={() => {
                  if (!shouldSkip && this.state.position === 0) {
                    this.play()
                  }
                }}
                onLoadedMetadata={({ currentTarget }) => {
                  if (currentTrack?.abPair && this.state.abSource === 'A') {
                    this.setState({ abSampleDuration: currentTarget.duration })
                  }
                }}
                onCanPlayThrough={() => {
                  if (this._pendingSeek !== null) {
                    const seekTo = this._pendingSeek
                    this._pendingSeek = null
                    this.getPlayer().currentTime = seekTo
                    this.setState({ position: seekTo * 1000 })
                    this.play()
                    return
                  }
                  if (shouldSkip && this.state.position === 0) {
                    this.setState({
                      position: previewDetails.start_ms,
                    })
                    this.getPlayer().currentTime = (previewDetails.start_ms - mp3Preview.start_ms) / 1000
                  }
                  this.play()
                }}
                onPause={() => this.setPlaying(false)}
                onTimeUpdate={({ currentTarget }) => {
                  const { currentTime } = currentTarget
                  this.setState({ position: currentTime * 1000 })
                  const abPair = currentTrack?.abPair
                  if (abPair) {
                    // Loop match: keep B inside the part the sample matched
                    const region = loopRegion(abPair, this.state.abSampleDuration)
                    if (this.state.abSource === 'B' && this.state.abLoop && region && currentTime >= region.end) {
                      currentTarget.currentTime = region.start
                    }
                    if (this.state.abSource === 'A') return
                  }
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
                    body: { message: 'Audio playback error', error: e.toString() },
                  })
                }}
                controlsList="nodownload"
                src={this.state.previewUrl}
              />
              {currentTrack ? (
                <>
                  <img
                    style={{
                      width: '100%',
                      height: 2,
                      position: 'absolute',
                      bottom: -5,
                      border: '1px solid #000',
                      display: this.state.embeddingMissing ? 'none' : 'block',
                    }}
                    alt={'embedding'}
                    src={`${apiURL}/tracks/${currentTrack.id}/embedding.png`}
                    onError={(e) => {
                      this.setState({ embeddingMissing: true })
                    }}
                    onLoad={(e) => {
                      this.setState({ embeddingMissing: false })
                    }}
                  />
                  <div
                    className={`preview-samples_container select-button select-button--container state-select-button--container noselect`}
                    style={{ left: 2 }}
                  >
                    <input
                      type="radio"
                      id="sample_select_state-preview"
                      name="sample-select-state"
                      checked={!this.state.preferFullTracks}
                      onChange={() => {
                        localStorage.setItem('preferFullTracks', 'false')
                        this.setState({ preferFullTracks: false })
                      }}
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
                                defaultChecked={this.state.mp3Preview?.id === id}
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
                      onChange={() => {
                        localStorage.setItem('preferFullTracks', 'true')
                        this.setState({ preferFullTracks: true })
                      }}
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
                                defaultChecked={this.state.mp3Preview?.id === id}
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
              <button className="button button-playback" onClick={() => this.togglePlaying('ui')}>
                <FontAwesomeIcon icon={this.state.playing ? 'pause' : 'play'} />
              </button>
              <button className="button button-playback" onClick={() => this.props.onPrevious()}>
                <FontAwesomeIcon icon="step-backward" />
              </button>
              <button className="button button-playback" onClick={() => this.props.onNext()}>
                <FontAwesomeIcon icon="step-forward" />
              </button>
              <div
                className="preview_actions_wrapper"
                style={{ fontSize: '75%', fontWeight: 350, display: isSample(currentTrack) ? 'none' : undefined }}
              >
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
                  <CartDropDownButton
                    {...{
                      processingCart,
                      inCart,
                      removeLabel,
                      trackId,
                      currentCartId,
                      cartFilter,
                      onCartFilterChange,
                      onClearCartFilter,
                    }}
                    carts={this.props.carts}
                    inCarts={this.props.inCarts}
                    selectedCartIsPurchased={this.props.selectedCartIsPurchased}
                    onCartButtonClick={this.props.onCartButtonClick}
                    onCreateCartClick={this.props.onCreateCartClick}
                    onMarkPurchasedButtonClick={this.props.onMarkPurchasedButtonClick}
                    disabled={!this.props.currentTrack || !this.props.hasSelectedTrack}
                  />
                )}
                <button
                  disabled={this.state.embeddingMissing}
                  onClick={() => search({ q: `track:~${currentTrack?.id}`, onlyNew: true })}
                  className={
                    'button button-push_button button-push_button-small button-push_button-primary preview-action_button no-style-link'
                  }
                  style={{ lineHeight: 'normal' }}
                >
                  <span className="button-push_button_icon">
                    <FontAwesomeIcon icon="circle-nodes" />
                  </span>{' '}
                  <span className="button-push_button_label">
                    <span className="preview-find-similar_long">Find similar</span>
                    <span className="preview-find-similar_short">Similar</span>
                  </span>
                </button>
                {this.props.mode === 'app' && (
                  <>
                    <button
                      disabled={!currentTrack}
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
                      disabled={!currentTrack}
                      className={
                        'button button-push_button button-push_button-small button-push_button-primary preview-action_button'
                      }
                      onClick={() => {
                        this.props.onIgnoreClicked(currentTrack)
                      }}
                    >
                      <span className="button-push_button_icon">
                        <FontAwesomeIcon icon={'ban'} />
                      </span>{' '}
                      <span className="button-push_button_label">Ignore</span>
                    </button>
                  </>
                )}
                <Popup
                  anchor={
                    <button
                      className={'pill pill-button button-push_button-small popup-anchor'}
                      style={{ height: '100%', margin: 0, border: '1px solid #000' }}
                    >
                      <span className="pill-button-contents">
                        <span className="button-push_button_icon">
                          <FontAwesomeIcon icon={'share'} />
                        </span>{' '}
                        <span className={'button-push_button_label'}>Share</span>
                        {this.props.currentTrack && (
                          <span className="preview-share_caret">
                            <FontAwesomeIcon icon={'caret-down'} />
                          </span>
                        )}
                      </span>
                    </button>
                  }
                  popupClassName={'popup_content-left'}
                >
                  {currentTrack && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span
                        className="pill pill-button-large pill-button"
                        style={{ width: '100%', margin: 0, marginBottom: 4, boxSizing: 'border-box', border: 0 }}
                      >
                        <span className="pill-button-contents">
                          <CopyToClipboardButton
                            title={shareLabel}
                            label={shareLabel}
                            content={shareContent}
                            style={{
                              width: '100%',
                              padding: '0 4px',
                              boxSizing: 'border-box',
                            }}
                          />
                        </span>
                      </span>
                      <ShareLink
                        size={'large'}
                        href={`https://telegram.me/share/url?url=${encodeURIComponent(
                          shareLink,
                        )}&text=${encodeURIComponent(shareContent)}`}
                        icon={<FontAwesomeIcon icon={['fab', 'telegram']} />}
                        label={'Share on Telegram'}
                      />
                      <ShareLink
                        size={'large'}
                        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                          shareLink,
                        )}&t=${encodeURIComponent(shareContent)}`}
                        icon={<FontAwesomeIcon icon={['fab', 'facebook']} />}
                        label={'Share on Facebook'}
                      />
                      <ShareLink
                        size={'large'}
                        href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(
                          shareLink,
                        )}&text=${encodeURIComponent(shareContent)}`}
                        icon={<FontAwesomeIcon icon={['fab', 'twitter']} />}
                        label={'Share on Twitter'}
                      />
                    </div>
                  )}
                </Popup>
              </div>
            </div>
            {this.props.newTracks !== null && this.props.totalTracks !== null ? (
              <Collection newTracks={this.props.newTracks} totalTracks={this.props.totalTracks} />
            ) : null}
          </div>
          <Progress
            className="volume-slider"
            percent={this.state.volume}
            barColor={colors.brandPrimary}
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
      const preview = this.props.currentTrack.previews.find(R.propEq(id, 'id'))

      await this.updateTrack(this.props.currentTrack, preview)
      this.setState({ mp3Preview: preview, position: 0, loading: false })
    } catch (e) {
      console.error(e)
      this.setState({ loading: false })
    }
  }
}

export default Preview
