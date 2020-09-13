import React, {Component} from 'react'
import * as R from 'ramda'
import TrackTitle from './TrackTitle.js'
import FontAwesome from 'react-fontawesome'
import * as L from 'partial.lenses'
import {preview} from './Preview.css'
import browser from 'browser-detect'
import config from './config'

const safePropEq = (prop, value) => R.pipe(
  R.defaultTo({}),
  R.propEq(prop, value)
)

class Preview extends Component {
  constructor(props) {
    super(props)

    this.state = { playing: false, position: 0 }
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

  componentWillUpdate(_, { playing }) {
    if (browser().name === 'safari') return

    if (this.state.playing !== playing) {
      this.getPlayer()[playing ? 'play' : 'pause']()
    }
  }

  render() {
    const menu = <button style={{ position: 'absolute', margin: 10 }} onClick={() => this.props.onMenuClicked()}>
      <FontAwesome name='bars'/>
    </button>
    if (!this.props.currentTrack) {
      return <div className='preview'>{menu}</div>
    }

    const mp3Preview = L.collect(['previews', L.satisfying(safePropEq('format', 'mp3'))], this.props.currentTrack)[0]
    const waveform = mp3Preview.waveform
    const totalDuration = mp3Preview.track_duration_ms
    const startOffset = mp3Preview.start_ms
    const endPosition = mp3Preview.end_ms
    const toPositionPercent = currentPosition => (currentPosition + startOffset) / totalDuration * 100

    const clipEdgeOverlayStyle = {
      height: '100%',
      background: 'white',
      opacity: 0.6,
      position: 'absolute'
    }
    return <div className='preview'>
      {menu}
      <TrackTitle className="preview-title" artists={(this.props.currentTrack || { artists: [] }).artists}
                  title={(this.props.currentTrack || {}).title}/>
      <div className='player-wrapper'>
        <button className='button button__light button-playback' onClick={() => this.props.onPrevious()}>
          <FontAwesome name='step-backward'/>
        </button>
        <button className='button button__light button-playback' onClick={() => this.props.onNext()}>
          <FontAwesome name='step-forward'/>
        </button>

        <button className='button button__light button-playback' onClick={() => this.togglePlaying()}>
          <FontAwesome name={this.state.playing ? 'pause' : 'play'}/>
        </button>
        <div className='fluid waveform_container' onClick={e => {
          const trackPositionPercent = (e.clientX - e.currentTarget.offsetLeft) / e.currentTarget.clientWidth
          const previewPositionInSeconds = (totalDuration * trackPositionPercent - startOffset) / 1000
          this.getPlayer().currentTime = previewPositionInSeconds
        }}>
          <img src={waveform} className='waveform waveform-background'/>
          <div className='waveform waveform-position'
               style={{ WebkitClipPath: `polygon(${toPositionPercent(0)}% 0, ${toPositionPercent(this.state.position)}% 0, ${toPositionPercent(this.state.position)}% 100%, ${toPositionPercent(0)}% 100%)`, WebkitMaskImage: `url(${waveform})`
               }}/>
          <div style={{
            width: `${toPositionPercent(0)}%`,
            left: 0,
            ...clipEdgeOverlayStyle}}/>
          <div style={{
            width: `${100 - 100 * endPosition / totalDuration}%`,
            right: 0,
            ...clipEdgeOverlayStyle}}/>
        </div>
        {
          <audio className='fluid' 
            ref='player0'
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
            src={`${config.apiUrl}/tracks/${this.props.currentTrack.id}/preview.mp3`} />
        }
      </div>
    </div>
  }
}

export default Preview
