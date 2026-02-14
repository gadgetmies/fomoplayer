import React, { Component } from 'react'
import { requestJSONwithCredentials } from './request-json-with-credentials'
import { apiURL } from './config'
import './AdminDuplicates.css'
import { withRouter } from 'react-router-dom'

class AdminDuplicates extends Component {
  constructor(props) {
    super(props)
    this.state = {
      loading: true,
      processing: false,
      duplicates: [],
      type: 'artist',
    }
  }

  async fetchDuplicates(type) {
    this.setState({ loading: true, type })
    try {
      const duplicates = await requestJSONwithCredentials({ url: `${apiURL}/admin/duplicates/${type}` })
      this.setState({ duplicates, loading: false })
    } catch (e) {
      console.error(e)
      this.setState({ loading: false })
    }
  }

  async componentDidMount() {
    await this.fetchDuplicates('artist')
  }

  async merge(keptId, deletedId, keptName, deletedName) {
    if (!window.confirm(`Merge "${deletedName}" (${deletedId}) into "${keptName}" (${keptId})?`)) return
    this.setState({ processing: true })
    try {
      await requestJSONwithCredentials({
        url: `${apiURL}/admin/duplicates/${this.state.type}/merge`,
        method: 'POST',
        body: { keptId, deletedId },
      })
      await this.fetchDuplicates(this.state.type)
    } finally {
      this.setState({ processing: false })
    }
  }

  async ignore(id1, id2) {
    this.setState({ processing: true })
    try {
      await requestJSONwithCredentials({
        url: `${apiURL}/admin/duplicates/${this.state.type}/ignore`,
        method: 'POST',
        body: { id1, id2 },
      })
      await this.fetchDuplicates(this.state.type)
    } finally {
      this.setState({ processing: false })
    }
  }

  renderArtist(duplicate) {
    return (
      <div key={duplicate.id} className="duplicate-item">
        <div className="duplicate-details">
          <div>
            <strong>{duplicate.name1}</strong> ({duplicate.id1})
          </div>
          <div>
            <strong>{duplicate.name2}</strong> ({duplicate.id2})
          </div>
        </div>
        <div className="duplicate-actions">
          <button disabled={this.state.processing} onClick={() => this.merge(duplicate.id1, duplicate.id2, duplicate.name1, duplicate.name2)}>
            Keep Left
          </button>
          <button disabled={this.state.processing} onClick={() => this.merge(duplicate.id2, duplicate.id1, duplicate.name2, duplicate.name1)}>
            Keep Right
          </button>
          <button disabled={this.state.processing} onClick={() => this.ignore(duplicate.id1, duplicate.id2)}>
            Ignore
          </button>
        </div>
      </div>
    )
  }

  renderTrack(duplicate) {
    const formatArtists = (artists) => artists.map((a) => `${a.name} (${a.role})`).join(', ')
    const title1 = `${duplicate.title1}${duplicate.version1 ? ` (${duplicate.version1})` : ''}`
    const title2 = `${duplicate.title2}${duplicate.version2 ? ` (${duplicate.version2})` : ''}`
    return (
      <div key={duplicate.id} className="duplicate-item">
        <div className="duplicate-details">
          <div>
            <strong>{title1}</strong>
            <br />
            <small>{formatArtists(duplicate.artists1)}</small> ({duplicate.id1})
          </div>
          <div>
            <strong>{title2}</strong>
            <br />
            <small>{formatArtists(duplicate.artists2)}</small> ({duplicate.id2})
          </div>
        </div>
        <div className="duplicate-actions">
          <button disabled={this.state.processing} onClick={() => this.merge(duplicate.id1, duplicate.id2, title1, title2)}>
            Keep Left
          </button>
          <button disabled={this.state.processing} onClick={() => this.merge(duplicate.id2, duplicate.id1, title2, title1)}>
            Keep Right
          </button>
          <button disabled={this.state.processing} onClick={() => this.ignore(duplicate.id1, duplicate.id2)}>
            Ignore
          </button>
        </div>
      </div>
    )
  }

  renderRelease(duplicate) {
    const formatArtists = (artists) => (artists ? artists.join(', ') : 'Unknown')
    return (
      <div key={duplicate.id} className="duplicate-item">
        <div className="duplicate-details">
          <div>
            <strong>{duplicate.name1}</strong>
            <br />
            <small>{formatArtists(duplicate.artists1)}</small> ({duplicate.id1})
          </div>
          <div>
            <strong>{duplicate.name2}</strong>
            <br />
            <small>{formatArtists(duplicate.artists2)}</small> ({duplicate.id2})
          </div>
        </div>
        <div className="duplicate-actions">
          <button disabled={this.state.processing} onClick={() => this.merge(duplicate.id1, duplicate.id2, duplicate.name1, duplicate.name2)}>
            Keep Left
          </button>
          <button disabled={this.state.processing} onClick={() => this.merge(duplicate.id2, duplicate.id1, duplicate.name2, duplicate.name1)}>
            Keep Right
          </button>
          <button disabled={this.state.processing} onClick={() => this.ignore(duplicate.id1, duplicate.id2)}>
            Ignore
          </button>
        </div>
      </div>
    )
  }

  render() {
    return (
      <div className="admin-duplicates">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Suspected Duplicates</h1>
          <button className="button button-push_button" onClick={() => this.props.history.push('/admin')}>
            Back to Radiator
          </button>
        </div>
        <div className="tabs">
          <button className={this.state.type === 'artist' ? 'active' : ''} onClick={() => this.fetchDuplicates('artist')}>
            Artists
          </button>
          <button className={this.state.type === 'track' ? 'active' : ''} onClick={() => this.fetchDuplicates('track')}>
            Tracks
          </button>
          <button
            className={this.state.type === 'release' ? 'active' : ''}
            onClick={() => this.fetchDuplicates('release')}
          >
            Releases
          </button>
        </div>
        {this.state.loading ? (
          <div>Loading...</div>
        ) : (
          <div className="duplicate-list">
            {this.state.duplicates.length === 0 && <div>No suspected duplicates found.</div>}
            {this.state.duplicates.map((d) => {
              if (this.state.type === 'artist') return this.renderArtist(d)
              if (this.state.type === 'track') return this.renderTrack(d)
              if (this.state.type === 'release') return this.renderRelease(d)
              return null
            })}
          </div>
        )}
      </div>
    )
  }
}

export default withRouter(AdminDuplicates)
