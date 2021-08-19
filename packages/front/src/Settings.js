import FontAwesome from 'react-fontawesome'
import React, { Component } from 'react'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials'
import SpinnerButton from './SpinnerButton'
import Spinner from './Spinner'

class Settings extends Component {
  unlockMarkAllHeard() {
    this.setState({ markAllHeardUnlocked: true })
  }

  markHeardButton = (label, interval) => (
    <SpinnerButton
      disabled={!this.state.markAllHeardUnlocked}
      loading={this.state.markingHeard === interval}
      onClick={async () => {
        this.setState({ markingHeard: interval })
        await this.props.onMarkHeardClicked(interval)
        this.setState({ markingHeard: null })
      }}
      label={label}
      loadingLabel={'Marking heard'}
    />
  )

  constructor(props) {
    super(props)
    this.state = {
      followQuery: '',
      artistFollows: [],
      labelFollows: [],
      playlistFollows: [],
      artistOnLabelIgnores: [],
      artistIgnores: [],
      labelIgnores: [],
      cartName: '',
      updatingFollows: false,
      updatingFollowDetails: false,
      updatingCarts: false,
      updatingArtistOnLabelIgnores: false,
      updatingArtistIgnores: false,
      updatingLabelIgnores: false,
      addingCart: false,
      removingCart: false,
      followDetailsDebounce: undefined,
      followDetails: undefined,
      followDetailsUpdateAborted: false,
      markAllHeardUnlocked: false,
      markingHeard: null
    }

    this.markHeardButton.bind(this)
  }

  async componentDidMount() {
    try {
      await Promise.all([this.updateFollows(), this.updateIgnores()])
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

  async updateIgnores() {
    await Promise.all([this.updateArtistIgnores(), this.updateLabelIgnores(), this.updateArtistOnLabelIgnores()])
  }

  async updateArtistIgnores() {
    const artistIgnores = await requestJSONwithCredentials({
      path: `/me/ignores/artists`
    })
    this.setState({ artistIgnores })
  }

  async updateLabelIgnores() {
    const labelIgnores = await requestJSONwithCredentials({
      path: `/me/ignores/labels`
    })
    this.setState({ labelIgnores })
  }

  async updateArtistOnLabelIgnores() {
    const artistOnLabelIgnores = await requestJSONwithCredentials({
      path: `/me/ignores/artists-on-labels`
    })
    this.setState({ artistOnLabelIgnores })
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
            Add by name or URL to follow:
            <div className="input-layout">
              <input
                className="text-input text-input-small"
                disabled={this.state.updatingFollows}
                value={this.state.followQuery}
                onChange={e => {
                  // TODO: replace aborted and debounce with flatmapLatest
                  this.setState({ followQuery: e.target.value, followDetails: undefined, updatingFollowDetails: false })
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
                        await requestWithCredentials({ path: `/followDetails?q=${this.state.followQuery}` })
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
            ) : this.state.followDetails === undefined ? null : this.state.followDetails.length === 0 ? (
              'No results found'
            ) : (
              <div>
                {this.state.followDetails.map(details => (
                  <SpinnerButton
                    className="button button-push_button-small button-push_button-primary"
                    disabled={this.state.updatingFollows}
                    loading={this.state.updatingFollows}
                    onClick={async () => {
                      this.setState({ updatingFollows: true })
                      const props = details.id
                        ? {
                            headers: { 'content-type': `application/vnd.multi-store-player.${details.type}-ids+json` },
                            body: [details.id]
                          }
                        : {
                            body: [{ url: this.state.followQuery }]
                          }

                      await requestJSONwithCredentials({
                        path: `/me/follows/${details.type}s`,
                        method: 'POST',
                        ...props
                      })
                      this.setState({ followQuery: '', followDetails: undefined })
                      await this.updateFollows()
                      this.setState({ updatingFollows: false })
                    }}
                  >
                    <FontAwesome name="plus" /> Add {details.type.replace(/^\w/, c => c.toUpperCase())}:{' '}
                    <span class="pill" style={{ backgroundColor: 'white', color: 'black' }}>
                      {details.stores.map(store => (
                        <span aria-hidden="true" className={`store-icon store-icon-${store}`}></span>
                      ))}{' '}
                      {details.label}
                    </span>
                  </SpinnerButton>
                ))}
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
          <h3>Ignores</h3>
          <h4>Artists ({this.state.artistIgnores.length})</h4>
          <ul className="no-style-list follow-list">
            {this.state.artistIgnores.map(artist => (
              <li key={artist.id}>
                <span disabled={this.state.updatingArtistIgnores} className="button pill pill-button">
                  <span className="pill-button-contents">
                    {artist.name}{' '}
                    <button
                      onClick={async () => {
                        this.setState({ updatingArtistIgnores: true })
                        await requestWithCredentials({ path: `/me/ignores/artists/${artist.id}`, method: 'DELETE' })
                        await this.updateArtistIgnores()
                        this.setState({ updatingArtistIgnores: false })
                      }}
                    >
                      <FontAwesome name="close" />
                    </button>
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <h4>Labels ({this.state.labelIgnores.length})</h4>
          <ul className="no-style-list follow-list">
            {this.state.labelIgnores.map(label => (
              <li key={label.id}>
                <span disabled={this.state.updatingLabelIgnores} className="button pill pill-button">
                  <span className="pill-button-contents">
                    {label.name}{' '}
                    <button
                      onClick={async () => {
                        this.setState({ updatingLabelIgnores: true })
                        await requestWithCredentials({ path: `/me/ignores/labels/${label.id}`, method: 'DELETE' })
                        await this.updateLabelIgnores()
                        this.setState({ updatingLabelIgnores: false })
                      }}
                    >
                      <FontAwesome name="close" />
                    </button>
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <h4>Artists on labels ({this.state.artistOnLabelIgnores.length})</h4>
          <ul className="no-style-list follow-list">
            {this.state.artistOnLabelIgnores.map(({ artist, label }) => (
              <li key={`${artist.id}-${label.id}`}>
                <span disabled={this.state.updatingArtistOnLabelIgnores} className="button pill pill-button">
                  <span className="pill-button-contents">
                    {artist.name} on ${label.name}
                    <button
                      onClick={async () => {
                        this.setState({ updatingArtistOnLabelIgnores: true })
                        await requestWithCredentials({
                          path: `/me/ignores/artists-on-labels/`,
                          method: 'PATCH',
                          body: { op: 'delete', artistId: artist.id, labelId: label.id }
                        })
                        await this.updateArtistOnLabelIgnores()
                        this.setState({ updatingArtistOnLabelIgnores: false })
                      }}
                    >
                      <FontAwesome name="close" />
                    </button>
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <h3>Collection</h3>
          <p>
            New tracks: {this.props.newTracks}
            <br />
            Total: {this.props.totalTracks}
            <br />
          </p>
          <h4>Mark tracks heard</h4>
          <p>
            Danger zone! This action cannot be undone!
            <br />
          </p>
          <p>
            <button
              type="submit"
              disabled={this.state.markAllHeardUnlocked}
              className={`button button-push_button-small button-push_button-primary`}
              style={this.props.style}
              onClick={this.unlockMarkAllHeard.bind(this)}
            >
              Enable buttons
            </button>
          </p>
          <p className="input-layout">
            {this.markHeardButton('Older than a month', '1 months')}
            {this.markHeardButton('Older than two months', '2 months')}
            {this.markHeardButton('Older than half a year', '6 months')}
            {this.markHeardButton('Older than one year', '1 years')}
            {this.markHeardButton('Older than two years', '2 years')}
          </p>
          <p className="input-layout">{this.markHeardButton('All tracks', '0')}</p>
        </div>
      </div>
    )
  }
}

export default Settings
