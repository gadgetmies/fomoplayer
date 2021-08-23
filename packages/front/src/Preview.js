import React, { Component } from 'react'
import * as R from 'ramda'
import TrackTitle from './TrackTitle.js'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import * as L from 'partial.lenses'
import './Preview.css'
import Progress from './Progress.jsx'
import WaveformGenerator from 'waveform-generator-web'
import { requestWithCredentials } from './request-json-with-credentials'
import Collection from './Collection'
import Spinner from './Spinner'
import StoreIcon from './StoreIcon'

const safePropEq = (prop, value) => R.pipe(R.defaultTo({}), R.propEq(prop, value))

const shortcuts = (
  <div style={{ float: 'right', color: 'white' }} className="popup-container">
    <FontAwesomeIcon icon="keyboard" className="popup-anchor" style={{ right: 0, top: 0, margin: 10 }} />
    <div className="popup-content" style={{ right: 0, top: 0, margin: '0 5 5 5', paddingRight: 50 }}>
      <h2 style={{ marginTop: 0 }}>Shortcuts</h2>
      <table>
        <tbody>
          <tr>
            <td>
              <span className="keyboard-shortcut">
                <FontAwesomeIcon icon="forward" />
              </span>
            </td>
            <td>x2</td>
            <td>Next</td>
          </tr>
          <tr>
            <td colSpan="2">
              <span className="keyboard-shortcut">
                <FontAwesomeIcon icon="forward" />
              </span>
            </td>
            <td>Seek forward</td>
          </tr>
          <tr>
            <td>
              <span className="keyboard-shortcut">
                <FontAwesomeIcon icon="backward" />
              </span>
            </td>
            <td>x2</td>
            <td>Previous</td>
          </tr>
          <tr>
            <td colSpan="2">
              <span className="keyboard-shortcut">
                <FontAwesomeIcon icon="backward" />
              </span>
            </td>
            <td>Seek backward</td>
          </tr>
          <tr>
            <td colSpan="2">
              <span className="keyboard-shortcut">
                <FontAwesomeIcon icon="play" />
              </span>
            </td>
            <td>Toggle playback</td>
          </tr>
          <tr>
            <td colSpan="2">
              <span className="keyboard-shortcut">Q</span>
            </td>
            <td>Previous</td>
          </tr>
          <tr>
            <td colSpan="2">
              <span className="keyboard-shortcut">W</span>
            </td>
            <td>Toggle playback</td>
          </tr>
          <tr>
            <td colSpan="2">
              <span className="keyboard-shortcut">E</span>
            </td>
            <td>Next</td>
          </tr>
          <tr>
            <td colSpan="2">
              <span className="keyboard-shortcut">R</span>
            </td>
            <td>Next new</td>
          </tr>
          <tr>
            <td colSpan="2">
              <span className="keyboard-shortcut">A</span>
            </td>
            <td>Scan forward</td>
          </tr>
          <tr>
            <td colSpan="2">
              <span className="keyboard-shortcut">D</span>
            </td>
            <td>Scan backward</td>
          </tr>
          <tr>
            <td colSpan="2">
              <span className="keyboard-shortcut">P</span>
            </td>
            <td>Add / remove current track to / from cart</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
)

class Preview extends Component {
  constructor(props) {
    super(props)

    this.state = { playing: false, position: 0, mp3Preview: undefined, waveform: undefined, totalDuration: undefined }
    if (window.AudioContext !== undefined) {
      this.audioContext = new AudioContext()
    }

    this.setVolume = this.setVolume.bind(this)
  }

  setPlaying(playing) {
    this.setState({ playing })
  }

  togglePlaying() {
    this.setState({ playing: !this.state.playing })
  }

  getPlayer() {
    return this.refs['player0']
  }

  async updateTrack(track, preview) {
    this.setState({ position: 0, waveform: undefined, totalDuration: undefined, mp3Preview: preview })
    let url = preview.url
    if (url === null) {
      this.setState({ previewUrl: '' })
      url = await this.fetchPreviewUrl(preview)
    }

    this.setState({ previewUrl: url })
    const waveform = this.getWaveform(track)
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

  async componentWillUpdate({ currentTrack: nextTrack }, { playing }) {
    if (this.state.playing !== playing) {
      const player = this.getPlayer()
      if (player) {
        player[playing ? 'play' : 'pause']()
      }
    }

    if (this.props.currentTrack !== nextTrack) {
      this.setState({ loading: true })
      try {
        const preview = this.getFirstMp3Preview(nextTrack)
        await this.updateTrack(nextTrack, preview)
      } catch (e) {
        console.error(e)
      }
      this.setState({ loading: false })
    }
  }

  getFirstMp3Preview(track) {
    return L.get(['previews', L.satisfying(safePropEq('format', 'mp3'))], track)
  }

  getWaveform(track) {
    return L.get(['previews', L.elems, 'waveforms', 0], track)
  }

  async updateWaveform(previewUrl) {
    try {
      const blob = await fetch(previewUrl).then(r => r.blob())
      const fileArrayBuffer = await blob.arrayBuffer()
      const waveformGenerator = new WaveformGenerator(fileArrayBuffer)
      const pngWaveformURL = await waveformGenerator.getWaveform({
        waveformWidth: 1024,
        waveformHeight: 170,
        waveformColor: '#cbcbcb'
      })

      const audioBuffer = await this.audioContext.decodeAudioData(fileArrayBuffer)
      this.setState({ waveform: pngWaveformURL, totalDuration: audioBuffer.duration * 1000 })
    } catch (e) {
      console.error(e)
    }
  }

  trackTitle(track) {
    return track ? `${track.title} ${track.version ? `(${track.version})` : ''}` : ''
  }

  setVolume(volume) {
    this.setState({ volume: volume * 100 })
    this.getPlayer().volume = volume
  }

  scan(step) {
    this.getPlayer().currentTime = this.getPlayer().currentTime + step
  }

  render() {
    const currentTrack = this.props.currentTrack
    let mp3Preview = this.state.mp3Preview
    let waveform = this.state.waveform
    let totalDuration = 0
    let startOffset = 0
    let endPosition = 0
    const toPositionPercent = currentPosition => ((currentPosition + startOffset) / totalDuration) * 100

    if (currentTrack && mp3Preview) {
      totalDuration = this.state.totalDuration || currentTrack.duration
      startOffset = mp3Preview.start_ms || 0
      endPosition = mp3Preview.end_ms || this.state.totalDuration
    }

    return (
      <div className="preview noselect">
        {shortcuts}
        <TrackTitle
          className="preview-title"
          artists={(currentTrack || { artists: [] }).artists}
          title={this.trackTitle(currentTrack)}
        />
        <div className="player-collection-wrapper">
          <div className="preview-wrapper">
            <div
              className="waveform_container"
              style={{ flex: 5, position: 'relative' }}
              onMouseDown={e => {
                if (e.button !== 0) return
                const trackPositionPercent = (e.clientX - e.currentTarget.offsetLeft) / e.currentTarget.clientWidth
                if (totalDuration * trackPositionPercent > endPosition) return
                const previewPositionInSeconds = (totalDuration * trackPositionPercent - startOffset) / 1000
                this.getPlayer().currentTime = previewPositionInSeconds
              }}
            >
              {waveform ? (
                <img
                  alt="waveform"
                  src={waveform}
                  className="waveform waveform-background"
                  onDragStart={e => e.preventDefault()}
                />
              ) : (
                <div className="waveform waveform-background" />
              )}
              <div
                className="waveform waveform-position"
                style={{
                  WebkitClipPath: `polygon(${toPositionPercent(0)}% 0, ${toPositionPercent(
                    this.state.position
                  )}% 0, ${toPositionPercent(this.state.position)}% 100%, ${toPositionPercent(0)}% 100%)`,
                  WebkitMaskImage: waveform ? `url(${waveform})` : 'none'
                }}
              />
              <div
                className={'waveform_clip-edge-overlay'}
                style={{
                  width: `${toPositionPercent(0)}%`,
                  left: 0
                }}
              />
              <div
                className={'waveform_clip-edge-overlay'}
                style={{
                  width: `${100 - (100 * endPosition) / totalDuration}%`,
                  right: 0
                }}
              />
              {currentTrack ? (
                <div className="preview-icons-container state-select-icon--container">
                  {currentTrack?.previews?.map(({ id, store }) => (
                    <span key={id} onMouseDown={e => e.stopPropagation()}>
                      <input
                        type="radio"
                        id={`preview-${id}`}
                        name="preview"
                        checked={this.state.mp3Preview?.id === id}
                        onChange={this.onPreviewStoreClicked.bind(this, id)}
                      />
                      <label className="state-select-icon--icon" htmlFor={`preview-${id}`}>
                        <StoreIcon code={store} />
                      </label>
                    </span>
                  ))}
                </div>
              ) : null}
              {this.state.loading ? (
                <div onMouseDown={e => e.stopPropagation()} className="loading-overlay">
                  <Spinner size="large" />
                </div>
              ) : null}
            </div>
            <Progress
              className="volume-slider"
              percent={this.state.volume}
              barColor="#b40089"
              bgColor="transparent"
              style={{ margin: 'auto 0', flex: 1, padding: '0.5em' }}
              onClick={e => {
                this.setVolume((e.clientX - e.currentTarget.offsetLeft) / e.currentTarget.clientWidth)
              }}
            />
            <audio
              ref="player0"
              autoPlay={true}
              onEnded={() => {
                this.setPlaying(false)
                this.props.onNext()
              }}
              onPlaying={() => this.setPlaying(true)}
              onPause={() => this.setPlaying(false)}
              onTimeUpdate={({ currentTarget: { currentTime } }) => {
                this.setState({ position: currentTime * 1000 })
              }}
              controlsList="nodownload"
              src={this.state.previewUrl}
            />
          </div>
          <div className="button-wrapper">
            <button className="button button__light button-playback" onClick={() => this.props.onPrevious()}>
              <FontAwesomeIcon icon="step-backward" />
            </button>
            <button className="button button__light button-playback" onClick={() => this.props.onNext()}>
              <FontAwesomeIcon icon="step-forward" />
            </button>
            <button className="button button__light button-playback" onClick={() => this.togglePlaying()}>
              <FontAwesomeIcon icon={this.state.playing ? 'pause' : 'play'} />
            </button>
            {this.props.togglingCurrentInCart ? (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: '0 9px 0 4px'
                }}
              >
                <Spinner size="large" color="#5A5A5A" />
              </div>
            ) : (
              <button
                className="button button__light button-playback"
                disabled={this.props.inCart === null || this.props.togglingCurrentInCart}
                onClick={async () => {
                  await this.props.onToggleCurrentInCart()
                }}
              >
                <FontAwesomeIcon icon={this.props.inCart ? 'minus' : 'plus'} />
              </button>
            )}
          </div>

          <Collection newTracks={this.props.newTracks} totalTracks={this.props.totalTracks} />
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
