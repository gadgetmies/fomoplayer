import FontAwesome from 'react-fontawesome'
import React, { Component } from 'react'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials'

class Settings extends Component {
  constructor(props) {
    super(props)
    this.state = {
      artistUrl: '',
      labelUrl: '',
      playlistUrl: '',
      artistFollows: [],
      labelFollows: [],
      playlistFollows: [],
      updatingArtistFollows: false,
      updatingLabelFollows: false,
      updatingPlaylistFollows: false
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
      <>
        <div className="page-container">
          <h2>Settings</h2>
          <h3>Following</h3>
          <h4>Playlists ({this.state.playlistFollows.length})</h4>
          <label>
            Add playlists to follow:
            <br />
            <div className="input-layout">
              <input
                className="text-input text-input-small"
                value={this.state.playlistUrl}
                onChange={e => this.setState({ playlistUrl: e.target.value })}
              />
              <button
                disabled={this.state.updatingPlaylistFollows}
                className="button button-push_button-small button-push_button-primary"
                onClick={async () => {
                  this.setState({ updatingPlaylistFollows: true })
                  await requestJSONwithCredentials({
                    path: '/me/follows/playlists',
                    method: 'POST',
                    body: [{ url: this.state.playlistUrl }]
                  })
                  this.setState({ playlistUrl: '' })
                  await this.updatePlaylistFollows()
                  this.setState({ updatingPlaylistFollows: false })
                }}
              >
                Add
              </button>
            </div>
          </label>
          <ul className="no-style-list follow-list">
            {this.state.playlistFollows.map(playlist => (
              <li>
                <button
                  disabled={this.state.updatingPlaylistFollows}
                  key={playlist.id}
                  className="button pill pill-button"
                  onClick={async () => {
                    this.setState({ updatingPlaylistFollows: true })
                    await requestWithCredentials({ path: `/me/follows/playlists/${playlist.id}`, method: 'DELETE' })
                    await this.updatePlaylistFollows()
                    this.setState({ updatingPlaylistFollows: false })
                  }}
                >
                  <span className="pill-button-contents">
                    <span
                      aria-hidden="true"
                      className={`store-icon store-icon-${playlist.storeName.toLowerCase()}`}
                    ></span>{' '}
                    {playlist.title} <FontAwesome name="close" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <h4>Artists ({this.state.artistFollows.length})</h4>
          <label>
            Add artists to follow:
            <br />
            <div className="input-layout">
              <input
                className="text-input text-input-small"
                value={this.state.artistUrl}
                onChange={e => this.setState({ artistUrl: e.target.value })}
              />
              <button
                disabled={this.state.updatingArtistFollows}
                className="button button-push_button-small button-push_button-primary"
                onClick={async () => {
                  this.setState({ updatingArtistFollows: true })
                  await requestJSONwithCredentials({
                    path: '/me/follows/artists',
                    method: 'POST',
                    body: [{ url: this.state.artistUrl }]
                  })
                  this.setState({ artistUrl: '' })
                  await this.updateArtistFollows()
                  this.setState({ updatingArtistFollows: false })
                }}
              >
                Add
              </button>
            </div>
          </label>
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
          <label>
            Add labels to follow:
            <br />
            <div className="input-layout">
              <input
                className="text-input text-input-small"
                value={this.state.labelUrl}
                onChange={e => this.setState({ labelUrl: e.target.value })}
              />
              <button
                disabled={this.state.updatingLabelFollows}
                className="button button-push_button-small button-push_button-primary"
                onClick={async () => {
                  this.setState({ updatingLabelFollows: true })
                  await requestJSONwithCredentials({
                    path: '/me/follows/labels',
                    method: 'POST',
                    body: [{ url: this.state.labelUrl }]
                  })
                  this.setState({ labelUrl: '' })
                  await this.updateLabelFollows()
                  this.setState({ updatingLabelFollows: false })
                }}
              >
                Add
              </button>
            </div>
          </label>
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
      </>
    )
  }
}

export default Settings
