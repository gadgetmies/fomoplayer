import FontAwesome from 'react-fontawesome'
import React, { Component } from 'react'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials'
import SpinnerButton from './SpinnerButton'
import Spinner from './Spinner'

class Settings extends Component {
  constructor(props) {
    super(props)
    this.state = {
      followUrl: '',
      artistFollows: [],
      labelFollows: [],
      playlistFollows: [],
      cartName: '',
      updatingFollows: false,
      updatingFollowDetails: false,
      updatingCarts: false,
      addingCart: false,
      removingCart: false,
      followDetailsDebounce: undefined,
      followDetails: undefined,
      followDetailsUpdateAborted: false
    }
  }

  async componentDidMount() {
    try {
      await this.updateFollows()
    } catch (e) {
      console.error(e)
    }

    this.setState({ loading: false })
  }

  async updateFollows() {
    await this.updateArtistFollows()
    await this.updateLabelFollows()
    await this.updatePlaylistFollows()
  }

  async updateArtistFollows() {
    const artistFollows = await requestJSONwithCredentials({
      path: `/me/follows/artists`
    })

    this.setState({ artistFollows })
  }

  async updateLabelFollows() {
    const labelFollows = await requestJSONwithCredentials({
      path: `/me/follows/labels`
    })
    this.setState({ labelFollows })
  }

  async updatePlaylistFollows() {
    const playlistFollows = await requestJSONwithCredentials({
      path: `/me/follows/playlists`
    })
    this.setState({ playlistFollows })
  }

  render() {
    return (
      <div className="page-container scroll-container settings-container">
        <div>
          <h2>Settings</h2>
          {/*
          <h3>Carts ({this.props.carts.length})</h3>
          <label>
            Add cart:
            <div className="input-layout">
              <input
                className="text-input text-input-small"
                disabled={this.state.updatingCarts}
                value={this.state.cartName}
                onChange={e => this.setState({ cartName: e.target.value })}
              />
              <SpinnerButton
                className="button button-push_button-small button-push_button-primary"
                loading={this.state.addingCart}
                disabled={this.state.cartName === '' || this.state.addingCart || this.state.updatingCarts}
                label="Add"
                loadingLabel="Adding"
                onClick={async () => {
                  this.setState({ updatingCarts: true, addingCart: true })
                  try {
                    await requestJSONwithCredentials({
                      path: `/me/carts`,
                      method: 'POST',
                      body: { name: this.state.cartName }
                    })
                    this.setState({ cartName: '' })
                    await this.props.onUpdateCarts()
                  } catch (e) {
                    console.error(e)
                  }
                  this.setState({ updatingCarts: false, addingCart: false })
                }}
              />
            </div>
          </label>
          <div>
            <ul className="no-style-list follow-list">
              {this.props.carts.map(cart => (
                <li>
                  <span disabled={this.state.updatingCarts} key={cart.id} className="button pill pill-button">
                    <span className="pill-button-contents">
                      {cart.name}{' '}
                      <button
                        disabled={this.state.addingCart || this.state.updatingCarts}
                        onClick={async () => {
                          this.setState({ updatingCarts: true })
                          await requestWithCredentials({ path: `/me/carts/${cart.id}`, method: 'DELETE' })
                          await this.props.onUpdateCarts()
                          this.setState({ updatingCarts: false })
                        }}
                      >
                        <FontAwesome name="close" />
                      </button>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          */}
          <h3>Following</h3>
          <label>
            Add URL to follow:
            <div className="input-layout">
              <input
                className="text-input text-input-small"
                disabled={this.state.updatingFollows}
                value={this.state.followUrl}
                onChange={e => {
                  // TODO: replace aborted and debounce with flatmapLatest
                  this.setState({ followUrl: e.target.value, followDetails: undefined, updatingFollowDetails: false })
                  if (this.state.followDetailsDebounce) {
                    clearTimeout(this.state.followDetailsDebounce)
                    this.setState({
                      followDetailsDebounce: undefined,
                      followDetailsUpdateAborted: this.state.followDetailsDebounce !== undefined
                    })
                  }

                  if (e.target.value === '') {
                    return
                  }
                  this.setState({ updatingFollowDetails: true, followDetailsUpdateAborted: false })
                  const timeout = setTimeout(async () => {
                    try {
                      const results = await (
                        await requestWithCredentials({ path: `/followDetails?url=${this.state.followUrl}` })
                      ).json()
                      if (this.state.followDetailsUpdateAborted) return
                      this.setState({ followDetails: results, updatingFollowDetails: false })
                    } catch (e) {
                      console.error('Error updating follow details', e)
                      clearTimeout(this.state.followDetailsDebounce)
                      this.setState({
                        updatingFollowDetails: false,
                        followDetailsDebounce: undefined
                      })
                    }
                  }, 500)
                  this.setState({ followDetailsDebounce: timeout })
                }}
              />
            </div>
            <br />
            {this.state.updatingFollowDetails ? (
              <Spinner size="large" />
            ) : this.state.followDetails === undefined ? null : (
              <div>
                <SpinnerButton
                  className="button button-push_button-small button-push_button-primary"
                  disabled={this.state.updatingFollows || this.state.followDetails === undefined}
                  loading={this.state.updatingFollows}
                  onClick={async () => {
                    this.setState({ updatingFollows: true })
                    await requestJSONwithCredentials({
                      path: `/me/follows/${this.state.followDetails.type}s`,
                      method: 'POST',
                      body: [{ url: this.state.followUrl }]
                    })
                    this.setState({ followUrl: '', followDetails: undefined })
                    await this.updateFollows()
                    this.setState({ updatingFollows: false })
                  }}
                >
                  <FontAwesome name="plus" /> Add {this.state.followDetails.type.replace(/^\w/, c => c.toUpperCase())}:{' '}
                  <span class="pill" style={{ backgroundColor: 'white', color: 'black' }}>
                    <span
                      aria-hidden="true"
                      className={`store-icon store-icon-${this.state.followDetails.store}`}
                    ></span>{' '}
                    {this.state.followDetails.label}
                  </span>
                </SpinnerButton>
              </div>
            )}
          </label>
          <h4>Playlists ({this.state.playlistFollows.length})</h4>
          <ul className="no-style-list follow-list">
            {this.state.playlistFollows.map(playlist => (
              <li>
                <span
                  disabled={this.state.updatingPlaylistFollows}
                  key={playlist.id}
                  className="button pill pill-button"
                >
                  <span className="pill-button-contents">
                    <span
                      aria-hidden="true"
                      className={`store-icon store-icon-${playlist.storeName.toLowerCase()}`}
                    ></span>{' '}
                    {playlist.title}{' '}
                    <button
                      onClick={async () => {
                        this.setState({ updatingPlaylistFollows: true })
                        await requestWithCredentials({ path: `/me/follows/playlists/${playlist.id}`, method: 'DELETE' })
                        await this.updatePlaylistFollows()
                        this.setState({ updatingPlaylistFollows: false })
                      }}
                    >
                      <FontAwesome name="close" />
                    </button>
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <h4>Artists ({this.state.artistFollows.length})</h4>
          <ul className="no-style-list follow-list">
            {this.state.artistFollows.map(artist => (
              <li>
                <button
                  disabled={this.state.updatingArtistFollows}
                  className="button pill pill-button"
                  onClick={async () => {
                    this.setState({ updatingArtistFollows: true })
                    await requestWithCredentials({ path: `/me/follows/artists/${artist.id}`, method: 'DELETE' })
                    await this.updateArtistFollows()
                    this.setState({ updatingArtistFollows: false })
                  }}
                >
                  <span className="pill-button-contents">
                    {artist.stores.map(({ name: storeName }) => (
                      <>
                        <span aria-hidden="true" className={`store-icon store-icon-${storeName.toLowerCase()}`}></span>{' '}
                      </>
                    ))}
                    {artist.name} <FontAwesome name="close" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <h4>Labels ({this.state.labelFollows.length})</h4>
          <ul className="no-style-list follow-list">
            {this.state.labelFollows.map(label => (
              <li>
                <button
                  disabled={this.state.updatingLabelFollows}
                  className="button pill pill-button"
                  onClick={async () => {
                    this.setState({ updatingLabelFollows: true })
                    await requestWithCredentials({ path: `/me/follows/labels/${label.id}`, method: 'DELETE' })
                    await this.updateLabelFollows()
                    this.setState({ updatingLabelFollows: false })
                  }}
                >
                  <span className="pill-button-contents">
                    {label.stores.map(({ name: storeName }) => (
                      <>
                        <span aria-hidden="true" className={`store-icon store-icon-${storeName.toLowerCase()}`}></span>{' '}
                      </>
                    ))}
                    {label.name} <FontAwesome name="close" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }
}

export default Settings
