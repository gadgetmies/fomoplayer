import React, { Component } from 'react'
import * as R from 'ramda'
import FontAwesome from 'react-fontawesome'
import PillButton from './PillButton.js'
import ExternalLink from './ExternalLink'
import SpinnerButton from './SpinnerButton'
import StoreIcon from './StoreIcon'
import { requestWithCredentials } from './request-json-with-credentials'

class Share extends Component {
  constructor(props) {
    super(props)
    this.state = {
      open: false
    }
  }

  getStoreTrackByStoreCode(code) {
    return this.props.stores.find(R.propEq('code', code))
  }

  render() {
    const spotifyTrack = this.getStoreTrackByStoreCode('spotify')
    const beaportTrack = this.getStoreTrackByStoreCode('beatport')
    const bandcampTrack = this.getStoreTrackByStoreCode('bandcamp')
    const searchString = `${this.props.artists.map(R.prop('name')).join('+')}+${this.props.title}`

    return (
      <>
        <PillButton
          className={'table-cell-button expand-collapse-button'}
          onClick={() => this.setState({ open: !this.state.open })}
        >
          <FontAwesome name={this.state.open ? 'caret-up' : 'caret-down'} />
        </PillButton>
        {this.state.open ? (
          <>
            <br />
            <ul className={'no-style-list'}>
              {beaportTrack ? null : (
                <li>
                  <ExternalLink href={`https://www.beatport.com/search?q=${searchString}`}>
                    <StoreIcon code="beatport" />
                  </ExternalLink>
                </li>
              )}
              {bandcampTrack ? null : (
                <li>
                  <ExternalLink href={`https://bandcamp.com/search?q=${searchString}`}>
                    <StoreIcon code="bandcamp" />
                  </ExternalLink>
                </li>
              )}
              {spotifyTrack ? null : (
                <li>
                  <ExternalLink href={`https://open.spotify.com/search/${searchString}`}>
                    <StoreIcon code="spotify" />
                  </ExternalLink>
                </li>
              )}
              <li>
                <ExternalLink href={`https://www.youtube.com/results?search_query=${searchString}`}>
                  <FontAwesome name="youtube" />
                </ExternalLink>
              </li>
            </ul>
          </>
        ) : null}
      </>
    )
  }
}

class Track extends Component {
  constructor(props) {
    super(props)
    this.state = {
      cartButtonDisabled: false,
      ignoreArtistsByLabelsDisabled: false,
      heardHover: false,
      heard: props.heard
    }
  }

  componentDidMount() {
    // TODO: this scrolls the preview player out of view
    // if (this.props.playing)
    // this.refs['row'].scrollIntoView()
  }

  componentDidUpdate(prevProps) {
    if (!R.equals(prevProps.inCart, this.props.inCart)) {
      this.setState({ cartButtonDisabled: false })
    }
  }

  isInCart(store) {
    return this.props.inCart.includes(store.name.toLowerCase())
  }

  setHeardHover(toState) {
    return this.setState({ heardHover: toState })
  }

  getStoreTrackByStoreCode(code) {
    return this.props.stores.find(R.propEq('code', code))
  }

  render() {
    const spotifyTrack = this.getStoreTrackByStoreCode('spotify')
    const beaportTrack = this.getStoreTrackByStoreCode('beatport')
    const bandcampTrack = this.getStoreTrackByStoreCode('bandcamp')
    const searchString = `${this.props.artists.map(R.prop('name')).join('+')}+${this.props.title}`

    return (
      <tr
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
          <button
            className="button table-cell-button"
            onClick={this.props.onDoubleClick.bind(this)}
            onMouseEnter={() => this.setHeardHover(true)}
            onMouseLeave={() => this.setHeardHover(false)}
          >
            {this.state.heardHover ? (
              <FontAwesome name="play" />
            ) : !!this.props.heard ? null : (
              <FontAwesome name="circle" />
            )}
          </button>
        </td>
        <td style={{ flex: 3, overflow: 'hidden' }}>
          {R.intersperse(
            ', ',
            this.props.artists.map(artist => (
              <span key={artist.id}>
                {artist.name}
                {/*<PillButton> + Follow </PillButton>*/}
              </span>
            ))
          )}
        </td>
        <td style={{ flex: 3, overflow: 'hidden' }}>
          {this.props.title} {this.props.mix ? `(${this.props.mix})` : ''}
        </td>
        <td style={{ flex: 2, overflow: 'hidden' }}>
          {R.intersperse(
            ', ',
            this.props.remixers.map(artist => (
              <span key={artist.id}>
                {artist.name}
                {/*<PillButton> + Follow </PillButton>*/}
              </span>
            ))
          )}
        </td>
        <td style={{ flex: 2, overflow: 'hidden', height: '100%' }}>
          {this.props.label}
          {/*<PillButton>*/}
          {/*+ Follow*/}
          {/*</PillButton>*/}
        </td>
        <td style={{ flex: 1 }}>{this.props.released}</td>
        <td style={{ flex: 1 }}>
          <ul className="comma-list">
            {this.props.keys.filter(R.propEq('system', 'open-key')).map(({ key }) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
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
        <td style={{ flex: 1.2 }} className="unfollow-row">
          {/*<PillButton className={'table-cell-button'}>*/}
          {/*by genre*/}
          {/*</PillButton>*/}
          {this.props.label ? (
            <PillButton
              className={'table-cell-button'}
              disabled={this.state.ignoreArtistsByLabelsDisabled}
              onClick={() => {
                this.setState({ ignoreArtistsByLabelsDisabled: true })
                this.props.onIgnoreArtistsByLabels()
              }}
            >
              artist on label
            </PillButton>
          ) : null}
        </td>
        <td style={{ flex: 1, textAlign: 'center' }}>
          <PillButton
            className={'table-cell-button'}
            onClick={async () => {
              if (this.props.inCart) {
                this.props.onRemoveFromCart(this.props.id)
              } else {
                this.props.onAddToCart(this.props.id)
              }
            }}
          >
            <FontAwesome name={this.props.inCart ? 'minus' : 'plus'} />
          </PillButton>
        </td>
        <td style={{ flex: 1, textAlign: 'center' }}>
          {R.intersperse(
            ' ',
            this.props.stores.map(store => (
              <ExternalLink
                showIcon={false}
                href={store.url || store.release.url}
                title={`Open in ${store.name}`}
                className={'link'}
              >
                <StoreIcon code={store.code} />
              </ExternalLink>
            ))
          )}
        </td>
        <td className="search-column">
          {/*<Share stores={this.props.stores} artists={this.props.artists} title={this.props.title} />*/}
          {beaportTrack ? null : (
            <>
              <ExternalLink showIcon={false} href={`https://www.beatport.com/search?q=${searchString}`}>
                <StoreIcon code="beatport" />
              </ExternalLink>{' '}
            </>
          )}
          {bandcampTrack ? null : (
            <>
              <ExternalLink showIcon={false} href={`https://bandcamp.com/search?q=${searchString}`}>
                <StoreIcon code="bandcamp" />
              </ExternalLink>{' '}
            </>
          )}
          {spotifyTrack ? null : (
            <>
              <ExternalLink showIcon={false} href={`https://open.spotify.com/search/${searchString}`}>
                <StoreIcon code="spotify" />
              </ExternalLink>{' '}
            </>
          )}
          <ExternalLink showIcon={false} href={`https://www.youtube.com/results?search_query=${searchString}`}>
            <FontAwesome name="youtube" />
          </ExternalLink>
        </td>
      </tr>
    )
  }
}

class Tracks extends Component {
  constructor(props) {
    super(props)
    this.state = {
      selectedTrack: (props.tracks[0] || {}).id,
      currentTrack: -1,
      markingHeard: false,
      currentBelowScreen: false,
      currentAboveScreen: false,
      search: '',
      searchDebounce: undefined
    }
    this.handleScroll = this.handleScroll.bind(this)
  }

  handleScroll() {
    let currentBelowScreen = false
    let currentAboveScreen = false
    const current = document.querySelector('.playing')

    if (current) {
      const currentRect = current.getBoundingClientRect()
      const parentRect = current.parentElement.getBoundingClientRect()
      if (currentRect.y - parentRect.y - currentRect.height > parentRect.height) {
        currentBelowScreen = true
      } else if (currentRect.y - parentRect.y < 0) {
        currentAboveScreen = true
      }
    }
    this.setState({ currentBelowScreen, currentAboveScreen })
  }

  scrollCurrentIntoView() {
    const current = document.querySelector('.playing')
    const currentRect = current.getBoundingClientRect()
    const parent = current.parentElement
    const parentRect = parent.getBoundingClientRect()
    parent.scrollBy(0, currentRect.y - parentRect.y)
  }

  async setSearch(search) {
    this.setState({ search })
    if (search === '') {
      this.props.onSearchResults(undefined)
      return
    }

    if (this.state.searchDebounce) {
      clearTimeout(this.state.searchDebounce)
    }

    const timeout = setTimeout(async () => {
      const results = await (await requestWithCredentials({ path: `/tracks?q=${search}` })).json()
      this.props.onSearchResults(results)
    }, 500)
    this.setState({ searchDebounce: timeout })
  }

  renderTracks(tracks, carts) {
    return tracks.length === 0 ? (
      <tr style={{ display: 'block' }}>
        <td>No tracks available</td>
      </tr>
    ) : (
      tracks.map(({ id, title, mix, artists, remixers, labels, released, keys, heard, stores }) => {
        return (
          <Track
            id={id}
            title={title}
            artists={artists}
            mix={mix}
            remixers={remixers}
            label={R.pluck('name', labels).join(', ')}
            released={released}
            keys={keys}
            stores={stores}
            selected={this.state.selectedTrack === id}
            playing={this.props.currentTrack === id}
            heard={heard}
            inCart={this.props.carts.find(R.prop('is_default')) ? this.props.carts.find(R.prop('is_default')).tracks.find(R.propEq('id', id)) : false}
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
            onIgnoreArtistsByLabels={() =>
              this.props.onIgnoreArtistsByLabels({
                artistIds: artists.map(R.prop('id')),
                labelIds: labels.map(R.prop('id'))
              })
            }
          />
        )
      })
    )
  }

  render() {
    const scrollToCurrentButton = (
      <button
        className={'button button-push_button-small button-push_button-primary button-push_button-glow'}
        onClick={this.scrollCurrentIntoView}
      >
        Scroll to current
      </button>
    )
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', color: 'white' }}>
          <div style={{ height: '100%', flex: 1, padding: 4 }} className="input-layout">
            <SpinnerButton
              size={'small'}
              loading={this.state.markingHeard}
              onClick={async () => {
                this.setState({ markingHeard: true })
                await this.props.onMarkAllHeardClicked()
                this.setState({ markingHeard: false })
              }}
              style={{ height: '100%', width: 150 }}
              label={'Mark all heard'}
              loadingLabel={'Marking all heard'}
            />
            <SpinnerButton
              size={'small'}
              loading={this.state.updatingTracks}
              onClick={async () => {
                this.setState({ updatingTracks: true })
                try {
                  await this.props.onUpdateTracksClicked()
                } finally {
                  this.setState({ updatingTracks: false })
                }
              }}
              style={{ height: '100%', width: 150 }}
              label={'Update list'}
              loadingLabel={'Updating list'}
            />
            <div className="state-select-button--container noselect">
              <input
                type="radio"
                id="tracklist-state-new"
                name="tracklist-state"
                className="state-select-button--button"
                defaultChecked={this.props.listState === 'new'}
                onChange={this.props.onShowNewClicked}
              />
              <label className="state-select-button--button" htmlFor="tracklist-state-new">
                New tracks
              </label>
              <input
                type="radio"
                id="tracklist-state-heard"
                name="tracklist-state"
                className="state-select-button--button"
                defaultChecked={this.props.listState === 'heard'}
                onChange={this.props.onShowHeardClicked}
              />
              <label className="state-select-button--button" htmlFor="tracklist-state-heard">
                Recently played
              </label>
              <input
                type="radio"
                id="tracklist-state-cart"
                name="tracklist-state"
                className="state-select-button--button"
                defaultChecked={this.props.listState === 'cart'}
                onChange={this.props.onShowCartClicked}
              />
              <label className="state-select-button--button" htmlFor="tracklist-state-cart">
                Cart
              </label>
            </div>
            <label style={{ margin: 4 }}>
              <input
                className="search"
                placeholder="Search"
                onChange={e => this.setSearch(e.target.value)}
                value={this.state.search}
              />
              <FontAwesome name="search" style={{ opacity: 0.7, margin: 4 }} />
            </label>
          </div>
          <div style={{ textAlign: 'right', padding: 4 }}>
            <div
              className="pill"
              style={{ margin: 2, padding: 4, backgroundColor: '#222', color: 'white', opacity: 0.7 }}
            >
              New: {this.props.newTracks}
            </div>
            <div
              className="pill"
              style={{ margin: 2, padding: 4, backgroundColor: '#222', color: 'white', opacity: 0.7 }}
            >
              Total: {this.props.totalTracks}
            </div>
          </div>
        </div>
        <table className="tracks-table" style={{ height: '100%', overflow: 'hidden', display: 'block' }}>
          <thead style={{ width: '100%', display: 'block' }} className={'noselect'}>
            <tr style={{ width: '100%', display: 'flex' }}>
              <th style={{ flex: 0.5, overflow: 'hidden' }} className={'table-button-cell-header'}>
                New
              </th>
              <th style={{ flex: 3, overflow: 'hidden' }}>Artist</th>
              <th style={{ flex: 3, overflow: 'hidden' }}>Title</th>
              <th style={{ flex: 2, overflow: 'hidden' }}>Remixer</th>
              <th style={{ flex: 2, overflow: 'hidden' }}>Label</th>
              <th style={{ flex: 1, overflow: 'hidden' }}>Released</th>
              <th style={{ flex: 1, overflow: 'hidden' }}>Key</th>
              {/* <th style={{ flex: 1, overflow: 'hidden' }} className={'table-button-cell-header'}>Cart</th> */}
              <th style={{ flex: 1.2, overflow: 'hidden' }} className={'table-button-cell-header'}>
                Ignore
                {/*Artists*/}
              </th>
              <th style={{ flex: 1, textAlign: 'center' }}>Cart</th>
              <th style={{ flex: 1, textAlign: 'center' }}>Stores</th>
              <th className="search-column table-button-cell-header">Search</th>
            </tr>
          </thead>
          {/* Replace the calc below. Currently it is calculated as height of preview + height of status bar + height of table header + height of the button row at the end of the table */}
          <tbody
            style={{ height: 'calc(100% - 166px)', overflow: 'scroll', display: 'block' }}
            onScroll={this.handleScroll}
          >
            <tr style={{ width: '100%', background: 'none', position: 'absolute' }}>
              <td
                style={{
                  width: '100%',
                  display: this.state.currentAboveScreen ? 'block' : 'none',
                  textAlign: 'center'
                }}
              >
                {scrollToCurrentButton}
              </td>
            </tr>
            {this.renderTracks(this.props.tracks, this.props.carts)}
            {this.props.listState === 'new' ? (
              <tr style={{ display: 'block' }}>
                <td style={{ display: 'block' }}>
                  <SpinnerButton
                    size={'large'}
                    loading={this.state.updatingTracks}
                    onClick={async () => {
                      this.setState({ updatingTracks: true })
                      try {
                        await this.props.onUpdateTracksClicked()
                      } finally {
                        this.setState({ updatingTracks: false })
                      }
                    }}
                    style={{ margin: 'auto', height: '100%', display: 'block' }}
                    label={'Load more'}
                    loadingLabel={'Loading'}
                  />
                </td>
              </tr>
            ) : null}
            <tr style={{ width: '100%', background: 'none', position: 'absolute', bottom: 0 }}>
              <td
                style={{
                  width: '100%',
                  display: this.state.currentBelowScreen ? 'block' : 'none',
                  textAlign: 'center'
                }}
              >
                {scrollToCurrentButton}
              </td>
            </tr>
          </tbody>
        </table>
      </>
    )
  }
}

export default Tracks
