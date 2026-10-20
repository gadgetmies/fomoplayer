import React, { Component } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import './NotificationsPage.css'
import {
  deleteAudioSample,
  loadAudioSamples,
  loadNotificationEvents,
  loadSampleMatches,
  loadSimilarToSample,
  markAllNotificationsRead,
  uploadAudioSample,
} from './audioSamplesApi'
import { requestWithCredentials } from './request-json-with-credentials'
import { namesToString } from './trackFunctions'
import { formatSeconds, formatTempo, matchedAtInTrack } from './abTiming'
import { groupSubscriptions } from './subscriptions'
import { sampleAsTrack, samplesSource } from './playQueue'
import GlobalSearchBar from './GlobalSearchBar'
import { searchTermsToString } from './searchTerms'
import { requestJSONwithCredentials } from './request-json-with-credentials'

export const activitySource = { key: 'activity', label: 'Notifications · Activity', path: '/notifications/activity' }
const matchesSource = (sample) => ({
  key: `matches:${sample.id}`,
  label: `Samples · ${sample.filename}`,
  path: '/notifications/samples',
})
const similarSource = (sample) => ({
  key: `similar:${sample.id}`,
  label: `Sounds like · ${sample.filename}`,
  path: '/notifications/samples',
})

const TABS = [
  { key: 'activity', label: 'Activity' },
  { key: 'samples', label: 'Samples' },
  { key: 'subscriptions', label: 'Subscriptions' },
]

const artistsText = (track) => namesToString([...(track?.artists || []), ...(track?.remixers || [])])
const labelsText = (track) => namesToString(track?.labels || [])
const titleText = (track) => (track ? `${track.title}${track.version ? ` (${track.version})` : ''}` : '')

const reasonText = (reason) => {
  if (reason.type === 'sample') return `Sample match · ${reason.filename}`
  const match = reason.text?.match(/^(artist|label):\d+$/)
  if (match) return `${match[1] === 'artist' ? 'Artist' : 'Label'} · ${reason.displayName}`
  return `Search · ${reason.displayName || reason.text}`
}

const arrivedText = (createdAt) => {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (24 * 3600 * 1000))
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

// A match row played as an aligned A/B pair: B is the match's preview, A the sample.
const matchAsAbTrack = (match, sample) => ({
  ...match,
  abPair: {
    sampleId: sample.id,
    sampleUrl: sample.url,
    sampleTitle: sample.filename,
    previewId: match.match.previewId,
    offsetSeconds: match.match.offsetSeconds,
    tempoFactor: match.match.tempoFactor,
  },
})

const matchPreviewStartMs = (match) =>
  match.previews?.find(({ id }) => String(id) === String(match.match.previewId))?.start_ms ?? 0

class NotificationsPage extends Component {
  constructor(props) {
    super(props)
    this.state = {
      events: null,
      samples: null,
      selectedSampleId: null,
      matches: null,
      similar: null,
      uploading: false,
      uploadError: null,
      followed: {},
      newSearchTerms: [],
      newSearchInput: '',
      // Bumped to empty the search bar after a search is added (it keeps its own typed text)
      newSearchKey: 0,
      addingSearch: false,
      genres: [],
    }
  }

  componentDidMount() {
    this.loadTab()
    requestJSONwithCredentials({ path: '/genres' })
      .then((genres) => this.setState({ genres }))
      .catch((e) => console.error('Failed to fetch genres', e))
  }

  componentDidUpdate(prevProps) {
    if (prevProps.tab !== this.props.tab || (!prevProps.visible && this.props.visible)) this.loadTab()
  }

  async loadTab() {
    if (!this.props.visible) return
    try {
      if (this.props.tab === 'activity') {
        this.setState({ events: await loadNotificationEvents() })
      } else if (this.props.tab === 'samples') {
        await this.loadSamples()
      }
    } catch (e) {
      console.error('Failed to load notifications', e)
    }
  }

  async loadSamples() {
    const samples = await loadAudioSamples()
    const selectedSampleId = samples.some(({ id }) => id === this.state.selectedSampleId)
      ? this.state.selectedSampleId
      : (samples[0]?.id ?? null)
    this.setState({ samples })
    await this.selectSample(selectedSampleId)
  }

  async selectSample(sampleId) {
    this.setState({ selectedSampleId: sampleId, matches: null, similar: null })
    if (!sampleId) return
    const [matches, similar] = await Promise.all([loadSampleMatches(sampleId), loadSimilarToSample(sampleId)])
    if (this.state.selectedSampleId === sampleId) this.setState({ matches, similar })
  }

  playEvent(event) {
    const tracks = this.state.events.map(({ track }) => track).filter(Boolean)
    this.props.onPlay(event.track, { source: activitySource, tracks })
    // Playing reads the event; show it straight away and let the bell catch up once the heard report lands
    this.setState({
      events: this.state.events.map((e) => (e.track?.id === event.track.id ? { ...e, read: true } : e)),
    })
    setTimeout(() => this.props.onUnreadChanged(), 1500)
  }

  async markAllRead() {
    await markAllNotificationsRead()
    this.setState({ events: (this.state.events || []).map((e) => ({ ...e, read: true })) })
    this.props.onUnreadChanged()
  }

  playMatch(match, sample) {
    const tracks = this.state.matches.map((m) => matchAsAbTrack(m, sample))
    this.props.onPlay(matchAsAbTrack(match, sample), { source: matchesSource(sample), tracks })
    this.setState({ matches: this.state.matches.map((m) => (m.id === match.id ? { ...m, unread: false } : m)) })
    setTimeout(() => this.props.onUnreadChanged(), 1500)
  }

  playSimilar(track, sample) {
    this.props.onPlay(track, { source: similarSource(sample), tracks: this.state.similar.tracks })
  }

  playSample(sample) {
    this.props.onPlay(sampleAsTrack(sample), { source: samplesSource, tracks: this.state.samples.map(sampleAsTrack) })
  }

  // The error is shown inline: a blocking alert() paused the playing track in Safari.
  async upload(file) {
    if (!file) return
    this.setState({ uploading: true, uploadError: null })
    try {
      await uploadAudioSample(file)
      await this.loadSamples()
    } catch (e) {
      console.error('Failed to upload audio sample', e)
      this.setState({ uploadError: `Failed to upload ${file.name}: ${e.message}` })
    } finally {
      this.setState({ uploading: false })
    }
  }

  renderEmailRequired(what) {
    return (
      <p className="notifications-email-required" role="note">
        <FontAwesomeIcon icon="circle-exclamation" /> {what} need a verified email address. Set it in{' '}
        <Link to="/settings/email">Settings › Email</Link>.
      </p>
    )
  }

  async remove(sample) {
    if (!window.confirm(`Delete ${sample.filename}?`)) return
    await deleteAudioSample(sample.id)
    await this.loadSamples()
  }

  async follow({ type, id }) {
    await requestWithCredentials({
      path: `/me/follows/${type}s`,
      method: 'POST',
      headers: { 'content-type': `application/vnd.multi-store-player.${type}-ids+json` },
      body: [id],
    })
    this.setState({ followed: { ...this.state.followed, [`${type}:${id}`]: true } })
    this.props.onFollowsChanged?.()
  }

  rowClass(trackId) {
    return `notifications-row${trackId === this.props.currentTrackId ? ' notifications-row--playing' : ''}`
  }

  renderActivity() {
    const { events } = this.state
    if (events === null) return <p className="notifications-hint">Loading…</p>
    const unread = events.filter(({ read }) => !read).length
    return (
      <>
        <div className="notifications-toolbar">
          <p className="notifications-hint">
            Everything you asked to hear about, newest first. Click a row to play it; next / previous then step through
            this list.
          </p>
          <button
            type="button"
            className="button button-push_button button-push_button-small button-push_button-primary"
            disabled={unread === 0}
            onClick={() => this.markAllRead()}
          >
            Mark all read
          </button>
        </div>
        {events.length === 0 ? (
          <p className="notifications-empty">
            Nothing yet. New tracks for your <Link to="/notifications/subscriptions">subscriptions</Link> and matches
            for your <Link to="/notifications/samples">audio samples</Link> appear here.
          </p>
        ) : (
          <div className="notifications-table-wrapper">
            <table className="notifications-table notifications-activity">
              <thead>
                <tr>
                  <th>New</th>
                  <th>Why</th>
                  <th>Artist</th>
                  <th>Title</th>
                  <th>Label</th>
                  <th>Arrived</th>
                </tr>
              </thead>
              <tbody>
                {events
                  .filter(({ track }) => track)
                  .map((event) => (
                    <tr
                      key={event.id}
                      className={this.rowClass(event.track.id)}
                      data-unread={event.read ? undefined : 'true'}
                      onClick={() => this.playEvent(event)}
                    >
                      <td>
                        <span
                          className={event.read ? 'new-dot new-dot--read' : 'new-dot'}
                          aria-label={event.read ? 'Read' : 'New'}
                        />
                      </td>
                      <td>
                        <span className={`why why--${event.reason.type}`}>{reasonText(event.reason)}</span>
                      </td>
                      <td>{artistsText(event.track)}</td>
                      <td>{titleText(event.track)}</td>
                      <td>{labelsText(event.track)}</td>
                      <td>{arrivedText(event.createdAt)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    )
  }

  renderSamples() {
    const { samples, selectedSampleId, matches, similar } = this.state
    if (samples === null) return <p className="notifications-hint">Loading…</p>
    const sample = samples.find(({ id }) => id === selectedSampleId)
    return (
      <>
        <h4 className="notifications-section-title">Audio sample uploads</h4>
        <p className="notifications-hint">
          You get an email when a track matching one of your samples is found or added. Pick a sample to hear it and its
          matches in the player above.
        </p>
        {this.props.emailVerified ? null : this.renderEmailRequired('Sample uploads')}
        {/* A real button, so it takes the buttons' own disabled style; it opens the hidden file input */}
        <input
          ref={(input) => (this.fileInput = input)}
          type="file"
          accept=".wav,.mp3,audio/wav,audio/mpeg"
          style={{ display: 'none' }}
          disabled={this.state.uploading || !this.props.emailVerified}
          onChange={(e) => {
            this.upload(e.target.files[0])
            e.target.value = ''
          }}
        />
        <button
          type="button"
          className="button button-push_button button-push_button-small button-push_button-primary notifications-upload"
          disabled={this.state.uploading || !this.props.emailVerified}
          onClick={() => this.fileInput?.click()}
        >
          <FontAwesomeIcon icon="upload" /> {this.state.uploading ? 'Uploading…' : 'Upload Audio Sample'}
        </button>
        {this.state.uploadError ? (
          <p className="notifications-error" role="alert">
            {this.state.uploadError}
          </p>
        ) : null}
        {samples.length === 0 ? (
          <p className="notifications-empty">No audio samples uploaded yet.</p>
        ) : (
          <div className="notifications-table-wrapper">
            <table className="notifications-table notifications-samples">
              <thead>
                <tr>
                  <th>Play</th>
                  <th>Sample</th>
                  <th>Added</th>
                  <th>Matches</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                {samples.map((s) => (
                  <tr
                    key={s.id}
                    className={`notifications-row${s.id === selectedSampleId ? ' notifications-row--selected' : ''}`}
                    onClick={() => this.selectSample(s.id)}
                  >
                    <td>
                      <button
                        type="button"
                        className="notifications-icon-button"
                        aria-label={`Play ${s.filename}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          this.playSample(s)
                        }}
                      >
                        <FontAwesomeIcon icon={this.props.currentTrackId === `sample-${s.id}` ? 'volume-up' : 'play'} />
                      </button>
                    </td>
                    <td>{s.filename}</td>
                    <td>{new Date(s.createdAt).toISOString().slice(0, 10)}</td>
                    <td>{s.matchCount ? `${s.matchCount} match${s.matchCount === 1 ? '' : 'es'}` : 'No match yet'}</td>
                    <td>
                      <button
                        type="button"
                        className="notifications-icon-button"
                        aria-label={`Delete ${s.filename}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          this.remove(s)
                        }}
                      >
                        <FontAwesomeIcon icon="times-circle" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sample ? this.renderMatches(sample, matches) : null}
        {sample ? this.renderSimilar(sample, similar) : null}
      </>
    )
  }

  renderMatches(sample, matches) {
    return (
      <>
        <div className="notifications-section-header">
          <h4 className="notifications-section-title">Matches for {sample.filename}</h4>
          <Link to={`/search/?q=sample:~${sample.id}`}>Open in Discover</Link>
        </div>
        {matches === null ? (
          <p className="notifications-hint">Loading…</p>
        ) : matches.length === 0 ? (
          <p className="notifications-empty">
            No match yet. New tracks are checked against this sample as they arrive — see Sounds like below.
          </p>
        ) : (
          <div className="notifications-table-wrapper">
            <table className="notifications-table notifications-matches">
              <thead>
                <tr>
                  <th>New</th>
                  <th>Artist</th>
                  <th>Title</th>
                  <th>Label</th>
                  <th>Matched at</th>
                  <th>Tempo</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => (
                  <tr
                    key={match.match.previewId}
                    className={this.rowClass(match.id)}
                    onClick={() => this.playMatch(match, sample)}
                  >
                    <td>
                      <span
                        className={match.unread ? 'new-dot' : 'new-dot new-dot--read'}
                        aria-label={match.unread ? 'New' : 'Read'}
                      />
                    </td>
                    <td>{artistsText(match)}</td>
                    <td>{titleText(match)}</td>
                    <td>{labelsText(match)}</td>
                    <td className="matched-at">
                      {formatSeconds(matchedAtInTrack(match.match.offsetSeconds, matchPreviewStartMs(match)))}
                    </td>
                    <td className="tempo">{formatTempo(match.match.tempoFactor)}</td>
                    <td>{match.match.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    )
  }

  renderSimilar(sample, similar) {
    return (
      <>
        <h4 className="notifications-section-title">Sounds like {sample.filename}</h4>
        {similar === null ? (
          <p className="notifications-hint">Loading…</p>
        ) : similar.pending || similar.tracks.length === 0 ? (
          <p className="notifications-empty">Similar tracks appear once the sample has been analysed.</p>
        ) : (
          <>
            <p className="notifications-hint">
              Tracks that sound closest to the sample (audio similarity, not a fingerprint match) and the artists and
              labels behind them. Click a row to hear it in the player.
            </p>
            <div className="notifications-similar">
              <div className="notifications-table-wrapper">
                <table className="notifications-table">
                  <thead>
                    <tr>
                      <th>Artist</th>
                      <th>Title</th>
                      <th>Label</th>
                      <th>Similarity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {similar.tracks.map((track) => (
                      <tr
                        key={track.id}
                        className={this.rowClass(track.id)}
                        onClick={() => this.playSimilar(track, sample)}
                      >
                        <td>{artistsText(track)}</td>
                        <td>{titleText(track)}</td>
                        <td>{labelsText(track)}</td>
                        <td>{Math.round(track.similarity * 100)} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="notifications-follow">
                <div className="notifications-follow-title">Follow to catch it</div>
                <ul className="no-style-list">
                  {similar.follow.map((entity) => {
                    const followed = entity.followed || this.state.followed[`${entity.type}:${entity.id}`]
                    return (
                      <li key={`${entity.type}:${entity.id}`}>
                        <span>
                          {entity.name}{' '}
                          <span className="notifications-hint">
                            · {entity.type} · {entity.count} similar track{entity.count === 1 ? '' : 's'}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="button button-push_button button-push_button-small button-push_button-primary"
                          aria-pressed={followed ? 'true' : 'false'}
                          disabled={followed}
                          onClick={() => this.follow(entity)}
                        >
                          {followed ? 'Following' : 'Follow'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <p className="notifications-hint">
                  New releases from followed artists and labels are fetched and checked against this sample, so the
                  track you are after can turn up as a match.
                </p>
              </div>
            </div>
          </>
        )}
      </>
    )
  }

  // The search as the top bar would serialise it: entity pills become artist:<id> / label:<id> and the like.
  newSearchText(committedTerms = this.state.newSearchTerms, inputValue = this.state.newSearchInput) {
    const typed = inputValue.trim() ? [{ type: 'text', value: inputValue.trim() }] : []
    return searchTermsToString([...committedTerms, ...typed])
  }

  async addSearch(text = this.newSearchText()) {
    if (!text || !this.props.emailVerified || this.state.addingSearch) return
    this.setState({ addingSearch: true })
    try {
      await this.props.onRequestNotificationUpdate(
        this.props.stores.map(({ storeName }) => ({ op: 'add', storeName, text })),
      )
      this.setState({ newSearchTerms: [], newSearchInput: '', newSearchKey: this.state.newSearchKey + 1 })
    } finally {
      this.setState({ addingSearch: false })
    }
  }

  renderSubscriptions() {
    const groups = groupSubscriptions(this.props.notifications)
    const group = (title, items, emptyText) => (
      <div className="notifications-subscription-group" key={title}>
        <h4 className="notifications-section-title">{title}</h4>
        {items.length === 0 ? (
          <p className="notifications-hint">{emptyText}</p>
        ) : (
          <ul className="no-style-list">
            {items.map((item) => (
              <li key={item.text} className="notifications-subscription">
                <NavLink to={`/search/?q=${encodeURIComponent(item.text)}`}>{item.displayName}</NavLink>
                <button
                  type="button"
                  className="notifications-bell notifications-bell--on"
                  aria-pressed="true"
                  aria-label={`Unsubscribe from ${item.displayName}`}
                  onClick={() =>
                    this.props.onRequestNotificationUpdate(
                      item.storeNames.map((storeName) => ({ op: 'remove', storeName, text: item.text })),
                    )
                  }
                >
                  <span className="notifications-bell_state">
                    <FontAwesomeIcon icon="bell" /> Subscribed
                  </span>
                  <span className="notifications-bell_action">
                    <FontAwesomeIcon icon="bell-slash" /> Unsubscribe
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
    return (
      <>
        <p className="notifications-hint">
          What you get notified about. Following an artist or label in{' '}
          <Link to="/settings/following">Settings › Following</Link> fills Discover; its bell decides whether you also
          get notified. Email address is in <Link to="/settings/email">Settings › Email</Link>.
        </p>
        {this.props.emailVerified ? null : this.renderEmailRequired('Subscriptions')}
        <div className="notifications-add-search" aria-label="Add a search">
          <GlobalSearchBar
            key={this.state.newSearchKey}
            terms={this.state.newSearchTerms}
            onChange={(newSearchTerms, newSearchInput) => this.setState({ newSearchTerms, newSearchInput })}
            onSearch={(committedTerms, inputValue) => this.addSearch(this.newSearchText(committedTerms, inputValue))}
            onClearSearch={() => this.setState({ newSearchTerms: [], newSearchInput: '' })}
            placeholder="e.g. artist:Name, label:Name or genre:dnb"
            styles="top_bar"
            className="notifications-add-search_bar"
            disabled={!this.props.emailVerified}
            loading={this.state.addingSearch}
            genres={this.state.genres}
          />
          <button
            type="button"
            className="button button-push_button button-push_button-small button-push_button-primary notifications-add-search_button"
            disabled={!this.props.emailVerified || this.state.addingSearch || !this.newSearchText()}
            onClick={() => this.addSearch()}
          >
            Add
          </button>
        </div>
        <div className="notifications-subscription-groups">
          {group('Searches', groups.searches, 'No search subscriptions.')}
          {group('Artists', groups.artists, 'Use the bell on a followed artist in Settings › Following.')}
          {group('Labels', groups.labels, 'Use the bell on a followed label in Settings › Following.')}
        </div>
      </>
    )
  }

  render() {
    const { tab, unreadCount } = this.props
    return (
      <div className="page-container scroll-container notifications-page" style={this.props.style}>
        <h2 className="notifications-heading">Notifications</h2>
        <div
          role="tablist"
          aria-label="Notifications"
          className="select-button select-button--container state-select-button--container noselect notifications-tabs"
        >
          {TABS.map(({ key, label }) => (
            <NavLink
              key={key}
              to={`/notifications/${key}`}
              role="tab"
              aria-selected={tab === key ? 'true' : 'false'}
              className={`select_button-button select_button-button__large notifications-tab${
                tab === key ? ' select_button-button__active notifications-tab--active' : ''
              }`}
            >
              {label}
              {key === 'activity' && unreadCount > 0 ? ` ${unreadCount}` : ''}
            </NavLink>
          ))}
        </div>
        {tab === 'samples'
          ? this.renderSamples()
          : tab === 'subscriptions'
            ? this.renderSubscriptions()
            : this.renderActivity()}
      </div>
    )
  }
}

export default NotificationsPage
