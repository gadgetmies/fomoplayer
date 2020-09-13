import React, {Component} from 'react'
import * as R from 'ramda'
import FontAwesome from 'react-fontawesome'
import PillButton from './PillButton.js'
import ExternalLink from './ExternalLink'
import SpinnerButton from './SpinnerButton'

class Share extends Component {
  constructor(props) {
    super(props)
    this.state = {
      open: false
    }
  }

  render() {
    return <>
      <PillButton
        className={'table-cell-button expand-collapse-button'}
        onClick={() => this.setState({open: !this.state.open})}>
        <FontAwesome name={this.state.open ? "caret-up" : "caret-down"}/>
      </PillButton>
      {this.state.open ?
        [<br/>,
        <ul className={'no-style-list'}>
          { this.props.stores.find(R.propEq('code', 'beatport')) ?
          <li>
            <ExternalLink
              href={`https://www.beatport.com/track/${this.props.title.toLowerCase().replace(' ', '-')}/${this.props.stores.find(R.propEq('code', 'beatport')).trackId}`}>
              Beatport
            </ExternalLink>
          </li> : null
          }
          { this.props.stores.find(R.propEq('code', 'bandcamp')) ?
          <li>
            <ExternalLink
              href={`${this.props.stores.find(R.propEq('code', 'bandcamp')).url}`}>
              Bandcamp
            </ExternalLink>
          </li> : null
          }
          <li>
            <ExternalLink
              href={`https://www.youtube.com/results?search_query=${this.props.artists.map(R.prop('name')).join('+')}+${this.props.title}`}>
              YouTube
            </ExternalLink>
          </li>
          <li>
            <ExternalLink
              href={`https://open.spotify.com/search/${this.props.artists.map(R.prop('name')).join(' ')} ${this.props.title}`}>
              Spotify
            </ExternalLink>
          </li>
        </ul>]
        : null
      }
    </>
  }
}

class Track extends Component {
  constructor(props) {
    super(props)
    this.state = {
      cartButtonDisabled: false,
      ignoreArtistsByLabelsDisabled: false,
      heardHover: false
    }
  }

  componentDidMount() {
    // TODO: this scrolls the preview player out of view
    // if (this.props.playing)
      // this.refs['row'].scrollIntoView()
  }

  componentDidUpdate(prevProps) {
    if (!R.equals(prevProps.inCart, this.props.inCart)) {
      this.setState({cartButtonDisabled: false})
    }
  }

  isInCart(store) {
    return this.props.inCart.includes(store.name.toLowerCase())
  }

  setHeardHover(toState) {
    return this.setState({heardHover: toState})
  }

  render() {
    return <tr
      ref={'row'}
      style={{ display: 'flex', width: '100%' }}
      // onClick={() => this.props.onClick()}
      // onTouchTap={() =>{
      //   this.props.onTouchTap()
      // }}
      onDoubleClick={() => {
        this.props.onDoubleClick()
      }}
      className={`track ${this.props.selected ? 'selected' : ''} ${this.props.playing ? 'playing' : ''}`}
    >
      <td style={{ flex: 0.5, overflow: 'hidden' }}>
        {
          this.props.heard ? null :
            <button className="button table-cell-button"
              onClick={this.props.onDoubleClick.bind(this)}
              onMouseEnter={() => this.setHeardHover(true)}
              onMouseLeave={() => this.setHeardHover(false)}>
              { this.state.heardHover ? <FontAwesome name="play"/> : <FontAwesome name="circle"/> }
            </button>
        }
      </td>
      <td style={{ flex: 3, overflow: 'hidden' }}>
        {
          R.intersperse(', ', this.props.artists.map(artist =>
            <span key={artist.id}>
              {artist.name}
              {/*<PillButton> + Follow </PillButton>*/}
            </span>
          ))
        }
      </td>
      <td style={{ flex: 3, overflow: 'hidden' }}>
        {this.props.title} {this.props.mix ? `(${this.props.mix})` : ''}
      </td>
      <td style={{ flex: 2, overflow: 'hidden' }}>
        {
          R.intersperse(', ', this.props.remixers.map(artist =>
            <span key={artist.id}>
              {artist.name}
              {/*<PillButton> + Follow </PillButton>*/}
            </span>
          ))
        }
      </td>
      <td style={{flex: 2, overflow: 'hidden', height: '100%', textOverflow: 'ellipsis'}}>
        {this.props.label}
        {/*<PillButton>*/}
          {/*+ Follow*/}
        {/*</PillButton>*/}
      </td>
      {/* <td style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {
          this.props.stores.map(store =>
            <PillButton
              key={store.id}
              disabled={this.state.cartButtonDisabled}
              className="table-cell-button"
              onClick={() => {
                this.setState({ cartButtonDisabled: true })
                if (this.isInCart(store)) {
                  this.props.onRemoveFromCart(store.code, store.trackId)
                } else {
                  this.props.onAddToCart(store.code, store.trackId)
                }
              }}>
              {this.isInCart(store) ? '-' : '+'} {store.name}
            </PillButton>
          )}
      </td> */}
      <td style={{ flex: 1, overflow: 'hidden' }} className="unfollow-row">
        {/*<PillButton className={'table-cell-button'}>*/}
          {/*by genre*/}
        {/*</PillButton>*/}
        {
          this.props.label ?
        <PillButton
          className={'table-cell-button'}
          disabled={this.state.ignoreArtistsByLabelsDisabled}
          onClick={() => {
            this.setState({ ignoreArtistsByLabelsDisabled: true })
            this.props.onIgnoreArtistsByLabels()
          }}
        >
          by label
        </PillButton> : null
        }
      </td>
      <td style={{ flex: 1, overflow: 'hidden' }}>
        <Share stores={this.props.stores} artists={this.props.artists} title={this.props.title}></Share>
      </td>
    </tr>
  }
}

class Tracks extends Component {
  constructor(props) {
    super(props)
    this.state = {
      selectedTrack: (props.tracks[0] || {}).id,
      currentTrack: -1,
      markingHeard: false
    }
  }

  renderTracks(tracks, carts) {
    return tracks.map(({ id, title, mix, artists, remixers, labels, heard, stores }) => {
      // if (!R.isEmpty(carts)) debugger
      return <Track
        id={id}
        title={title}
        artists={artists}
        mix={mix}
        remixers={remixers}
        label={R.pluck('name', labels).join(', ')}
        stores={stores}
        selected={this.state.selectedTrack === id}
        playing={this.props.currentTrack === id}
        heard={heard}
        inCart={
            stores
              .filter(({ code, trackId }) =>
                (carts[code] || []).includes(trackId))
              .map(({code}) => code)
        }
        key={id}
        // onClick={() => this.setState({ selectedTrack: id })}
        onDoubleClick={() => {
          this.props.onPreviewRequested(id)
        }}
        // onTouchTap={() => {
        //   this.props.onPreviewRequested(id)
        // }}
        onAddToCart={this.props.onAddToCart}
        onRemoveFromCart={this.props.onRemoveFromCart}
        onIgnoreArtistsByLabels={() => this.props.onIgnoreArtistsByLabels({
            artistIds: artists.map(R.prop('id')),
            labelIds: labels.map(R.prop('id'))
          })
        }
      />
    })
  }

  render() {
    return <>
      <div style={{display: 'flex', alignItems: 'center', color: 'white'}}>
        <div style={{height: '100%', flex: 1, padding: 4}}>
          <SpinnerButton
            size={'small'}
            loading={this.state.markingHeard}
            onClick={async () => {
              this.setState({markingHeard: true})
              await this.props.onMarkAllHeardClicked()
              this.setState({markingHeard: false})
            }}
            style={{margin: 2, height: '100%', width: 150, margin: 4}}
            label={'Mark all heard'}
            loadingLabel={'Marking all heard'}
            />
          <SpinnerButton
            size={'small'}
            loading={this.state.updatingTracks}
            onClick={async () => {
              this.setState({updatingTracks: true})
              try {
                await this.props.onUpdateTracksClicked()
              } finally {
                this.setState({updatingTracks: false})
              }
            }}
            style={{margin: 2, height: '100%', width: 150, margin: 4}}
            label={'Update list'}
            loadingLabel={'Updating list'}
            />
            <div className='state-select-button--container'>
              <input type='radio' id='tracklist-state-new' name='tracklist-state' className='state-select-button--button' defaultChecked={this.props.listState === 'new'} onChange={this.props.onShowNewClicked}/>
              <label className='state-select-button--button' htmlFor='tracklist-state-new'>
                New tracks
              </label>
              <input type='radio' id='tracklist-state-heard' name='tracklist-state' className='state-select-button--button' defaultChecked={this.props.listState === 'heard'} onChange={this.props.onShowHeardClicked}/>
              <label className='state-select-button--button' htmlFor='tracklist-state-heard'>
                Recently played
              </label>
            </div>
        </div>
        <div style={{flex: 1, textAlign: 'right', padding: 4}}>
          <PillButton style={{padding: 4, '-webkit-filter': '', backgroundColor: '#444', color: 'white'}}>
            New: {this.props.newTracks}
          </PillButton>
          <PillButton style={{ padding: 4, '-webkit-filter': '', backgroundColor: '#444', color: 'white'}}>
            Total: {this.props.totalTracks}
          </PillButton>
        </div>
      </div>
      <table className="tracks-table" style={{ height: "100%", overflow: "hidden", display: "block" }}>
        <thead style={{ width: "100%", display: "block" }}>
        <tr style={{ width: "100%", display: "flex" }}>
          <th style={{ flex: 0.5, overflow: 'hidden' }} className={'table-button-cell-header'}>New</th>
          <th style={{ flex: 3, overflow: 'hidden' }}>Artist</th>
          <th style={{ flex: 3, overflow: 'hidden' }}>Title</th>
          <th style={{ flex: 2, overflow: 'hidden' }}>Remixer</th>
          <th style={{flex: 2, overflow: 'hidden'}}>Label</th>
          {/* <th style={{ flex: 1, overflow: 'hidden' }} className={'table-button-cell-header'}>Cart</th> */}
          <th style={{ flex: 1, overflow: 'hidden' }} className={'table-button-cell-header'}>Unfollow{/*Artists*/}</th>
          <th style={{ flex: 1, overflow: 'hidden' }} className={'table-button-cell-header'}>Open in</th>
        </tr>
        </thead>
        {/* Replace the calc below. Currently it is calculated as height of preview + height of status bar + height of table header + height of the button row at the end of the table */}
        <tbody style={{ height: "calc(100% - 166px)", overflow: "scroll", display: "block" }}>
        {
          this.renderTracks(this.props.tracks, this.props.carts)
        }
        {
          this.props.listState === 'new' ?
          <tr style={{display: 'block'}}>
            <td style={{display: 'block'}}>
            <SpinnerButton
                size={'large'}
                loading={this.state.updatingTracks}
                onClick={async () => {
                  this.setState({updatingTracks: true})
                  try {
                    await this.props.onUpdateTracksClicked()
                  } finally {
                    this.setState({updatingTracks: false})
                  }
                }}
                style={{margin: 'auto', height: '100%', display: 'block'}}
                label={'Load more'}
                loadingLabel={'Loading'}
                />
            </td>
          </tr> : null
        }
        </tbody>
      </table>
    </>
  }
}

export default Tracks
