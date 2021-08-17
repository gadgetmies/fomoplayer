import React, { Component } from 'react'
import * as R from 'ramda'
import TrackTitle from './TrackTitle.js'
import FontAwesome from 'react-fontawesome'
import * as L from 'partial.lenses'
import './Preview.css'
import Progress from './Progress.jsx'
import WaveformGenerator from 'waveform-generator-web'
import { requestWithCredentials } from './request-json-with-credentials'
import Collection from './Collection'
import Spinner from './Spinner'

const safePropEq = (prop, value) => R.pipe(R.defaultTo({}), R.propEq(prop, value))

class Preview extends Component {
  constructor(props) {
    super(props)

    this.state = { playing: false, position: 0, waveform: undefined, totalDuration: undefined }
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

  updateTrack(track, previewUrl) {
    this.setState({ previewUrl })
    const waveform = this.getWaveform(track)
    if (!waveform && this.audioContext) {
      this.updateWaveform(previewUrl).catch(e => {
        console.error(e)
      })
    }
  }

  componentWillUpdate({ currentTrack: nextTrack }, { playing }) {
    if (this.props.currentTrack !== nextTrack) {
      const preview = this.getPreview(nextTrack)
      this.setState({ position: 0, waveform: undefined, totalDuration: undefined })
      if (preview.url === null) {
        this.setState({ previewUrl: '' })
        requestWithCredentials({ path: `/stores/${preview.store}/previews/${preview.id}` })
          .then(res => res.json())
          .then(({ url }) => this.updateTrack(nextTrack, url))
      } else {
        this.updateTrack(nextTrack, preview.url)
      }
    }

    if (this.state.playing !== playing) {
      const player = this.getPlayer()
      if (player) {
        player[playing ? 'play' : 'pause']()
      }
    }
  }

  getPreview(track) {
    return L.get(['previews', L.satisfying(safePropEq('format', 'mp3'))], track)
  }

  getWaveform(track) {
    return L.get(['previews', L.elems, 'waveform', L.satisfying(R.identity)], track)
  }

  async updateWaveform(previewUrl) {
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
    const shortcuts = (
      <div style={{ float: 'right', color: 'white' }} className="popup-container">
        <FontAwesome name="keyboard-o" className="popup-anchor" style={{ right: 0, top: 0, margin: 10 }} />
        <div className="popup-content" style={{ right: 0, top: 0, margin: '0 5 5 5', paddingRight: 50 }}>
          <h2 style={{ marginTop: 0 }}>Shortcuts</h2>
          <table>
            <tbody>
              <tr>
                <td>
                  <span className="keyboard-shortcut">
                    <FontAwesome name="forward" />
                  </span>
                </td>
                <td>x2</td>
                <td>Next</td>
              </tr>
              <tr>
                <td colSpan="2">
                  <span className="keyboard-shortcut">
                    <FontAwesome name="forward" />
                  </span>
                </td>
                <td>Seek forward</td>
              </tr>
              <tr>
                <td>
                  <span className="keyboard-shortcut">
                    <FontAwesome name="backward" />
                  </span>
                </td>
                <td>x2</td>
                <td>Previous</td>
              </tr>
              <tr>
                <td colSpan="2">
                  <span className="keyboard-shortcut">
                    <FontAwesome name="backward" />
                  </span>
                </td>
                <td>Seek backward</td>
              </tr>
              <tr>
                <td colSpan="2">
                  <span className="keyboard-shortcut">
                    <FontAwesome name="play" />
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

    const currentTrack = this.props.currentTrack
    let mp3Preview
    let waveform
    let totalDuration = 0
    let startOffset = 0
    let endPosition = 0
    const toPositionPercent = currentPosition => ((currentPosition + startOffset) / totalDuration) * 100

    if (currentTrack) {
      mp3Preview = this.getPreview(currentTrack)
      waveform = this.getWaveform(currentTrack) || this.state.waveform
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
              style={{ flex: 5 }}
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
              <FontAwesome name="step-backward" />
            </button>
            <button className="button button__light button-playback" onClick={() => this.props.onNext()}>
              <FontAwesome name="step-forward" />
            </button>
            <button className="button button__light button-playback" onClick={() => this.togglePlaying()}>
              <FontAwesome name={this.state.playing ? 'pause' : 'play'} />
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
                <FontAwesome name={this.props.inCart ? 'minus' : 'plus'} />
              </button>
            )}
          </div>

          <Collection
            newTracks={this.props.newTracks}
            totalTracks={this.props.totalTracks}
          />
        </div>
      </div>
    )
  }
}

export default Preview
