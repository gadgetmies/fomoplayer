import './Tracks.css'
import React, { Component } from 'react'
import * as R from 'ramda'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import SpinnerButton from './SpinnerButton'
import { requestWithCredentials } from './request-json-with-credentials'
import { isMobile } from 'react-device-detect'
import './Select.css'
import Track from './Track'

class Tracks extends Component {
  constructor(props) {
    super(props)
    this.state = {
      selectedTrack: (props.tracks[0] || {}).id,
      selectedCart: null,
      currentTrack: -1,
      markingHeard: false,
      currentBelowScreen: false,
      currentAboveScreen: false,
      search: '',
      searchOpen: false,
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

    if (this.state.searchDebounce) {
      clearTimeout(this.state.searchDebounce)
    }

    if (search === '') {
      this.props.onSearchResults([])
      return
    }

    const timeout = setTimeout(async () => {
      const results = await (await requestWithCredentials({ path: `/tracks?q=${search}` })).json()
      this.props.onSearchResults(results)
    }, 500)
    this.setState({ searchDebounce: timeout })
  }

  toggleSearch() {
    this.setState({ searchOpen: !this.state.searchOpen })
  }

  renderTracks(tracks, carts) {
    const emptyListLabels = {
      search: 'No results',
      cart: 'Cart empty',
      new: 'No tracks available',
      heard: 'No tracks played'
    }
    const defaultCart = carts.find(R.prop('is_default'))

    return tracks.length === 0 ? (
      <tr style={{ display: 'block' }}>
        <td>{emptyListLabels[this.props.listState]}</td>
      </tr>
    ) : (
      tracks.map((track, index) => {
        const { id, title, mix, artists, remixers, labels, releases, released, keys, heard, stores, version } = track
        return (
          <Track
            mode={this.props.mode}
            listState={this.props.listState}
            cartUuid={this.props.selectedCart?.uuid}
            carts={this.props.carts}
            defaultCartId={this.props.carts.find(R.prop('is_default'))?.id}
            id={id}
            index={index}
            title={title}
            artists={artists}
            mix={mix}
            remixers={remixers}
            labels={labels}
            released={released}
            releases={releases}
            keys={keys}
            stores={stores}
            selected={this.state.selectedTrack === id}
            playing={this.props.currentTrack === id}
            version={version}
            heard={heard}
            inDefaultCart={defaultCart ? defaultCart.tracks.find(R.propEq('id', id)) !== undefined : false}
            inCarts={this.props.carts.filter(cart => cart.tracks.find(R.propEq('id', id)))}
            key={id}
            onClick={() => {
              this.props.onPreviewRequested(id)
            }}
            onDoubleClick={() => {
              this.props.onPreviewRequested(id)
            }}
            onTouchTap={() => {
              this.props.onPreviewRequested(id)
            }}
            onAddToCart={this.props.onAddToCart}
            onRemoveFromCart={this.props.onRemoveFromCart}
            onFollowClicked={() => {
              this.props.onFollowClicked(track)
            }}
            onIgnoreClicked={() => {
              this.props.onIgnoreClicked(track)
            }}
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

  async refreshTracks() {
    this.setState({ updatingTracks: true })
    try {
      await this.props.onUpdateTracksClicked()
    } finally {
      this.setState({ updatingTracks: false })
    }
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
      <div>
        <div className={'top-bar input-layout'}>
          {this.props.mode === 'app' ? (
            <div className="top-bar-group">
              <div
                className="state-select-button state-select-button--container noselect"
                style={{ display: 'inline-block', flex: 0 }}
              >
                <input
                  type="radio"
                  id="tracklist-state-new"
                  name="tracklist-state"
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
                  defaultChecked={this.props.listState === 'heard'}
                  onChange={this.props.onShowHeardClicked}
                />
                <label className="state-select-button--button" htmlFor="tracklist-state-heard">
                  Recently played
                </label>
                <input
                  type="radio"
                  id="tracklist-state-recentlyAdded"
                  name="tracklist-state"
                  defaultChecked={this.props.listState === 'recentlyAdded'}
                  onChange={this.props.onShowRecentlyAddedClicked}
                />
                <label className="state-select-button--button" htmlFor="tracklist-state-recentlyAdded">
                  Recently added
                </label>
                <input
                  type="radio"
                  id="tracklist-state-cart"
                  name="tracklist-state"
                  defaultChecked={this.props.listState === 'cart'}
                  onChange={this.props.onShowCartClicked}
                />
                <label className="state-select-button--button" htmlFor="tracklist-state-cart">
                  Carts
                </label>
                <input
                  type="radio"
                  id="tracklist-state-search"
                  name="tracklist-state"
                  defaultChecked={this.props.listState === 'search'}
                  onChange={this.props.onShowSearchClicked}
                />
                <label className="state-select-button--button" htmlFor="tracklist-state-search">
                  Search
                </label>
              </div>
            </div>
          ) : null}
          {!isMobile && !this.props.mode === 'app' ? (
            <SpinnerButton
              style={{ display: 'inline-block', flex: 0 }}
              className="refresh-tracks"
              size={'small'}
              loading={this.state.updatingTracks}
              onClick={this.refreshTracks.bind(this)}
              label={'Refresh list'}
              loadingLabel={'Refreshing'}
            />
          ) : null}
          {this.props.listState !== 'search' ? null : (
            <div className="top-bar-group">
              <label className="search-bar">
                <input
                  autoFocus
                  id="search"
                  className="search"
                  onChange={e => this.setSearch(e.target.value)}
                  value={this.state.search}
                />
                {this.state.search ? (
                  <FontAwesomeIcon
                    onClick={() => this.setSearch('')}
                    className={'search-input-icon clear-search'}
                    icon="times-circle"
                  />
                ) : (
                  <FontAwesomeIcon className={'search-input-icon'} icon="search" />
                )}
              </label>
            </div>
          )}
          {this.props.listState !== 'cart' ? null : (
            <div className="top-bar-group">
              <div className="state-select-button state-select-button--container cart-bar">
                <label className="state-select-button--button" htmlFor="cart-select">
                  Cart:
                </label>
                {this.props.mode === 'app' ? (
                  <select
                    className="select"
                    id="cart-select"
                    onChange={e => this.props.onSelectCart(parseInt(e.target.value))}
                  >
                    {this.props.carts.map(cart => (
                      <option value={cart.id} key={cart.id}>
                        {cart.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="state-select-button--button state-select-button--button__active">
                    {this.props.carts[0].name}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        <table className="tracks-table" style={{ height: '100%', overflow: 'hidden', display: 'block' }}>
          <thead className={'noselect tracks-table-header'}>
            <tr style={{ display: 'block' }} className={'noselect'}>
              {this.props.mode === 'app' ? (
                <th className={'new-cell tracks-cell'}>
                  <div className={'new-cell-content track-table-cell'}>New</div>
                </th>
              ) : null}
              <th className={'track-details tracks-cell'}>
                <div className={'track-details-left track-details-content'}>
                  <div className={'artist-cell track-table-cell'}>Artist</div>
                  <div className={'title-cell track-table-cell'}>Title</div>
                  <div className={'label-cell track-table-cell'}>Label</div>
                  <div className={'released-cell track-table-cell'}>Released</div>
                </div>
                <div className={'track-details-right track-details-content'}>
                  <div className={'key-cell track-table-cell'}>Key</div>
                </div>
              </th>
              {this.props.mode === 'app' ? (
                <th className={'follow-ignore-cart-cell tracks-cell'}>
                  <div className={'cart-cell track-table-cell'}>Cart</div>
                  <div className={'follow-cell track-table-cell'}>Follow</div>
                  <div className={'ignore-cell track-table-cell'}>Ignore</div>
                </th>
              ) : null}
              <th className={'open-search-cell tracks-cell'}>
                <div className={'open-cell track-table-cell'}>Open</div>
                <div className={'search-cell track-table-cell'}>Search</div>
              </th>
            </tr>
          </thead>
          <tbody style={{ overflow: 'scroll', display: 'block' }} onScroll={this.handleScroll}>
            <tr style={{ width: '100%', background: 'none', position: 'absolute', zIndex: 1 }}>
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
              <tr style={{ display: 'flex' }}>
                <td style={{ flex: 1 }}>
                  <SpinnerButton
                    size={'large'}
                    loading={this.state.updatingTracks}
                    onClick={this.refreshTracks.bind(this)}
                    style={{ margin: 'auto', height: '100%', display: 'block' }}
                    label={'Load more'}
                    loadingLabel={'Loading'}
                  />
                </td>
              </tr>
            ) : null}
            <tr style={{ height: 120 }} />
            <tr style={{ width: '100%', background: 'none', position: 'absolute', bottom: 0, zIndex: 1 }}>
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
      </div>
    )
  }
}

export default Tracks
