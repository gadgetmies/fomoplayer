import React, {Component} from 'react'
import * as R from 'ramda'
import FontAwesome from 'react-fontawesome'
import PillButton from './PillButton.js'
import ExternalLink from './ExternalLink'

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
      ignoreArtistsByLabelDisabled: false
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
            <button className="button table-cell-button">
              <FontAwesome name="circle"/>
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
        {this.props.title}
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
      <td style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
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
      </td>
      <td style={{ flex: 1, overflow: 'hidden' }} className="unfollow-row">
        {/*<PillButton className={'table-cell-button'}>*/}
          {/*by genre*/}
        {/*</PillButton>*/}
        {
          this.props.label ?
        <PillButton
          className={'table-cell-button'}
          onClick={() => {
            this.setState({ ignoreArtistsByLabelDisabled: true })
            this.props.onIgnoreArtistsByLabel()
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
    this.state = { selectedTrack: (props.tracks[0] || {}).id, currentTrack: -1 }
  }

  renderTracks(tracks, carts) {
    return tracks.map(({ id, title, artists, remixers, label, heard, stores }) => {
      // if (!R.isEmpty(carts)) debugger
      return <Track
        id={id}
        title={title}
        artists={artists}
        remixers={remixers}
        label={label.name}
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
        onIgnoreArtistsByLabel={() => this.props.onIgnoreArtistsByLabel(
          artists.map(artist => ({
            artistId: artist.id,
            labelId: label.id
          }))
        )}
      />
    })
  }

  render() {
    return <table className="tracks-table" style={{ height: "100%", overflow: "hidden", display: "block" }}>
      <thead style={{ width: "100%", display: "block" }}>
      <tr style={{ width: "100%", display: "flex" }}>
        <th colSpan={9} style={{flex: 1}}>New tracks: {this.props.newTracks} / {this.props.totalTracks} </th>
      </tr>
      <tr style={{ width: "100%", display: "flex" }}>
        <th style={{ flex: 0.5, overflow: 'hidden' }} className={'table-button-cell-header'}>New</th>
        <th style={{ flex: 3, overflow: 'hidden' }}>Artist</th>
        <th style={{ flex: 3, overflow: 'hidden' }}>Title</th>
        <th style={{ flex: 2, overflow: 'hidden' }}>Remixer</th>
        <th style={{flex: 2, overflow: 'hidden'}}>Label</th>
        <th style={{ flex: 1, overflow: 'hidden' }} className={'table-button-cell-header'}>Cart</th>
        <th style={{ flex: 1, overflow: 'hidden' }} className={'table-button-cell-header'}>Unfollow Artists</th>
        <th style={{ flex: 1, overflow: 'hidden' }} className={'table-button-cell-header'}>Open in</th>
      </tr>
      </thead>
      <tbody style={{ height: "calc(100% - 100px)", overflow: "scroll", display: "block" }}>
      {
        this.renderTracks(this.props.tracks, this.props.carts)
      }
      </tbody>
    </table>
  }
}

export default Tracks
