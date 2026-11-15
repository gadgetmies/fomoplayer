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
import { groupSubscriptions, visibleSubscriptions } from './subscriptions'
import SearchBar from './SearchBar'
import './FollowedItem.css'
import { sampleAsTrack, samplesSource } from './playQueue'
import GlobalSearchBar from './GlobalSearchBar'
import { searchTermsToString } from './searchTerms'
import Track from './Track'
import SpinnerButton from './SpinnerButton'
import './Tracks.css'
import './Track.css'

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
const matchCountText = (count) => (count ? `${count} match${count === 1 ? '' : 'es'}` : 'No match yet')
const titleText = (track) => (track ? `${track.title}${track.version ? ` (${track.version})` : ''}` : '')

const reasonText = (reason) => {
  if (reason.type === 'sample') return `Sample match · ${reason.filename}`
  const match = reason.text?.match(/^(artist|label):\d+$/)
  if (match) return `${match[1] === 'artist' ? 'Artist' : 'Label'} · ${reason.displayName}`
  return `Search · ${reason.displayName || reason.text}`
}

const reasonIcon = (reason) => {
  if (reason.type === 'sample') return 'wave-square'
  const match = reason.text?.match(/^(artist|label):\d+$/)
  if (match) return match[1] === 'artist' ? 'user' : 'record-vinyl'
  return 'magnifying-glass'
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
      // Matches or Sounds like, for the open sample
      samplesView: 'matches',
      matches: null,
      similar: null,
      uploading: false,
      uploadError: null,
      followed: {},
      // `${type}:${id}` of the suggestion being followed
      following: null,
      newSearchTerms: [],
      newSearchInput: '',
      // Bumped to empty the search bar after a search is added (it keeps its own typed text)
      newSearchKey: 0,
      addingSearch: false,
      subscriptionFilterOpen: false,
      subscriptionFilter: '',
      expandedGroups: {},
      cartFilter: '',
    }
  }

  componentDidUpdate(prevProps, prevState) {
    // A link to a sample (?sample=<id>) opened it: bring its row into view once it has rendered
    if (this.scrollToSampleId) {
      const row = document.getElementById(`notifications-sample-${this.scrollToSampleId}`)
      if (row) {
        this.scrollToSampleId = null
        row.scrollIntoView({ block: 'start' })
      }
    }
    if (prevProps.tab !== this.props.tab || (!prevProps.visible && this.props.visible)) this.loadTab()
    // The rows carry their carts: reload them when a cart changes, from a row or from the player above the page
    else if (this.props.tab === 'activity' && prevProps.carts !== this.props.carts) this.loadTab()
    // The filter pill turned into its field: type straight away
    if (this.state.subscriptionFilterOpen && !prevState.subscriptionFilterOpen) {
      this.subscriptionFilterContainer?.querySelector('input')?.focus()
    }
  }

  closeSubscriptionFilter() {
    this.setState({ subscriptionFilterOpen: false, subscriptionFilter: '' })
  }

  componentDidMount() {
    this.loadTab()
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

  // The sample a link asks for (/notifications/samples?sample=<id>), once per link and only when it is the user's
  linkedSampleId(samples) {
    const requested = new URLSearchParams(window.location.search).get('sample')
    if (!requested || requested === this.handledSampleLink) return null
    this.handledSampleLink = requested
    return samples.find(({ id }) => String(id) === requested)?.id ?? null
  }

  async loadSamples() {
    const previous = this.state.samples
    const samples = await loadAudioSamples()
    const linked = this.linkedSampleId(samples)
    const current = this.state.selectedSampleId
    // Keep the open sample open, and keep all closed if the user closed them; open the first one when the list
    // was empty before (first load, first upload)
    const selectedSampleId =
      linked ??
      (samples.some(({ id }) => id === current) ? current : previous?.length ? null : (samples[0]?.id ?? null))
    if (linked !== null) this.scrollToSampleId = linked
    this.setState({ samples })
    if (selectedSampleId !== current || this.state.matches === null) await this.selectSample(selectedSampleId)
  }

  async selectSample(sampleId) {
    this.setState({ selectedSampleId: sampleId, samplesView: 'matches', matches: null, similar: null })
    if (!sampleId) return
    const [matches, similar] = await Promise.all([loadSampleMatches(sampleId), loadSimilarToSample(sampleId)])
    if (this.state.selectedSampleId === sampleId) this.setState({ matches, similar })
  }

  // Opening a sample closes the open one; opening the open one closes it
  toggleSample(sampleId) {
    if (sampleId === this.state.selectedSampleId) {
      this.setState({ selectedSampleId: null, matches: null, similar: null })
    } else {
      this.selectSample(sampleId)
    }
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
    const key = `${type}:${id}`
    this.setState({ following: key })
    try {
      await requestWithCredentials({
        path: `/me/follows/${type}s`,
        method: 'POST',
        headers: { 'content-type': `application/vnd.multi-store-player.${type}-ids+json` },
        body: [id],
      })
      // A followed artist or label is no longer suggested
      this.setState({ followed: { ...this.state.followed, [key]: true } })
      this.props.onFollowsChanged?.()
    } catch (e) {
      console.error('Following a suggestion failed', e)
    } finally {
      this.setState({ following: null })
    }
  }

  rowClass(trackId) {
    return `notifications-row${trackId === this.props.currentTrackId ? ' notifications-row--playing' : ''}`
  }

  // The Activity toolbar control, shown in the tab bar like the cart controls above the cart track list
  renderMarkAllHeard() {
    const { events } = this.state
    const unread = (events || []).filter(({ read }) => !read).length
    return (
      <button
        type="button"
        className="button button-push_button button-push_button-small button-push_button-primary notifications-mark-all-heard"
        disabled={unread === 0}
        onClick={() => this.markAllRead()}
      >
        Mark all heard
      </button>
    )
  }

  // Marking a row heard (the New cell or Mark as heard) reads its notifications too
  markEventHeard(trackId) {
    const event = (this.state.events || []).find(({ track }) => track?.id === trackId)
    if (!event) return
    this.props.onMarkHeard?.(event.track)
    const heard = new Date().toISOString()
    this.setState({
      events: this.state.events.map((e) =>
        e.track?.id === trackId ? { ...e, read: true, track: { ...e.track, heard: e.track.heard || heard } } : e,
      ),
    })
    setTimeout(() => this.props.onUnreadChanged(), 1500)
  }

  renderActivity() {
    const { events } = this.state
    if (events === null) return <p className="notifications-hint">Loading…</p>
    const carts = this.props.carts || []
    const defaultCart = carts.find(({ isDefault }) => isDefault)
    const stores = this.props.stores || []
    const storeSlugs = stores.map(({ storeName }) => storeName.toLowerCase())
    const rows = events.filter(({ track }) => track)
    return (
      <>
        {events.length === 0 ? (
          <p className="notifications-empty">
            Nothing yet. New tracks for your <Link to="/notifications/subscriptions">subscriptions</Link> and matches
            for your <Link to="/notifications/samples">audio samples</Link> appear here.
          </p>
        ) : (
          // The same table, rows and cells as the main track list, with the reason in its own Why column
          <table className="tracks-table notifications-activity">
            <thead className="noselect tracks-table-header">
              <tr className="noselect tracks-table-header-columns">
                <th className="new-cell tracks-cell">
                  <div className="new-cell-content track-table-cell">New</div>
                </th>
                <th className="track-details tracks-cell">
                  <div className="track-details-left track-details-content">
                    <div className="artist-cell track-table-cell text-header-cell">Artist</div>
                    <div className="title-cell track-table-cell text-header-cell">Title</div>
                    <div className="label-cell track-table-cell text-header-cell">Label</div>
                  </div>
                  <div className="track-details-center track-details-content">
                    <div className="arrived-cell track-table-cell text-header-cell">Arrived</div>
                  </div>
                  <div className="track-details-right track-details-content">
                    <div className="genre-cell track-table-cell">Genre</div>
                    <div className="bpm-cell track-table-cell">BPM</div>
                    <div className="key-cell track-table-cell">Key</div>
                  </div>
                </th>
                <th className="why-cell why-cell--column tracks-cell">
                  <div className="track-table-cell text-header-cell">Why</div>
                </th>
                <th className="follow-ignore-cart-cell tracks-cell">
                  <div className="score-cell track-table-cell" />
                  <div className="cart-cell track-table-cell">Cart</div>
                </th>
                <th className="open-share-cell tracks-cell">
                  <div className="open-cell track-table-cell">Open</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event, index) => {
                const { track } = event
                const trackCarts = (track.carts || []).filter(Boolean)
                const inCarts = carts.filter((cart) => trackCarts.some(({ uuid }) => uuid === cart.uuid))
                const previews = (track.previews || []).filter(({ store }) => storeSlugs.includes(store))
                const play = () => this.playEvent(event)
                return (
                  <Track
                    key={event.id}
                    mode="app"
                    listState="notifications"
                    id={track.id}
                    index={index}
                    title={track.title}
                    version={track.version}
                    artists={track.artists || []}
                    remixers={track.remixers || []}
                    labels={track.labels || []}
                    released={track.released}
                    keys={track.keys || []}
                    bpms={Array.from(new Set((track.stores || []).map(({ bpm }) => bpm)))}
                    genres={track.genres || []}
                    score={track.score}
                    trackStores={track.stores || []}
                    stores={stores}
                    // Read notifications show as heard: the New cell follows the notification, not the play history
                    heard={event.read ? track.heard || event.createdAt : null}
                    arrived={arrivedText(event.createdAt)}
                    why={
                      <span className="why" title={reasonText(event.reason)}>
                        <FontAwesomeIcon className="why_icon" icon={reasonIcon(event.reason)} />
                        <span className="why_text">{reasonText(event.reason)}</span>
                      </span>
                    }
                    playing={this.props.currentTrackId === track.id}
                    carts={carts}
                    cartFilter={this.state.cartFilter}
                    defaultCartId={defaultCart?.id}
                    inDefaultCart={defaultCart ? trackCarts.some(({ uuid }) => uuid === defaultCart.uuid) : false}
                    inCarts={inCarts}
                    processingCart={this.props.processingCart}
                    processingTrack={this.props.processingTrack}
                    follows={this.props.follows}
                    noPreviews={previews.every(({ url, store }) => !url && store !== 'bandcamp')}
                    popupAbove={rows.length > 10 && rows.length - index < 10}
                    onClick={play}
                    onDoubleClick={play}
                    onTouchTap={play}
                    onMarkHeardButtonClick={(trackId) => this.markEventHeard(trackId)}
                    onCartButtonClick={this.props.onCartButtonClick}
                    onCreateCartClick={this.props.onCreateCartClick}
                    onMarkPurchasedButtonClick={this.props.onMarkPurchased}
                    onCartFilterChange={(cartFilter) => this.setState({ cartFilter })}
                    onAddEntityToSearch={this.props.onAddEntityToSearch}
                  />
                )
              })}
            </tbody>
          </table>
        )}
      </>
    )
  }

  renderSamples() {
    const { samples, selectedSampleId } = this.state
    if (samples === null) return <p className="notifications-hint">Loading…</p>
    return (
      <>
        <h4 className="notifications-section-title">Audio sample uploads</h4>
        <p className="notifications-hint">
          You get an email when a track matching one of your samples is found or added. Open a sample to see its matches
          right underneath it.
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
          <ul className="no-style-list notifications-samples">
            {samples.map((sample) => this.renderSample(sample, sample.id === selectedSampleId))}
          </ul>
        )}
      </>
    )
  }

  // One sample: a header row that opens its content right underneath it. The header's first child is a real button
  // covering the whole row, so a click anywhere but play, the view toggle and delete opens or closes the sample
  // without nesting buttons.
  renderSample(sample, open) {
    const contentId = `notifications-sample-content-${sample.id}`
    return (
      <li key={sample.id} id={`notifications-sample-${sample.id}`} className="notifications-sample">
        <div className={`notifications-sample_header${open ? ' notifications-sample_header--open' : ''}`}>
          <button
            type="button"
            className="notifications-sample_toggle"
            aria-expanded={open ? 'true' : 'false'}
            aria-controls={open ? contentId : undefined}
            aria-label={`${open ? 'Hide' : 'Show'} matches for ${sample.filename}`}
            onClick={() => this.toggleSample(sample.id)}
          />
          <button
            type="button"
            className="notifications-sample_play"
            aria-label={`Play ${sample.filename}`}
            onClick={() => this.playSample(sample)}
          >
            <FontAwesomeIcon icon={this.props.currentTrackId === `sample-${sample.id}` ? 'volume-up' : 'play'} />
          </button>
          <span className="notifications-sample_info">
            <span className="notifications-sample_name">{sample.filename}</span>
            <span className="notifications-sample_meta">
              <span className="notifications-sample_added">
                Added {new Date(sample.createdAt).toISOString().slice(0, 10)}
              </span>
              <span className="notifications-sample_count">{matchCountText(sample.matchCount)}</span>
            </span>
          </span>
          {open ? this.renderSampleViews(sample) : null}
          <button
            type="button"
            className="notifications-sample_delete"
            aria-label={`Delete ${sample.filename}`}
            onClick={() => this.remove(sample)}
          >
            <FontAwesomeIcon icon="trash-can" />
          </button>
          <span className="notifications-sample_divider" aria-hidden="true" />
          <FontAwesomeIcon
            className="notifications-sample_chevron"
            icon={open ? 'chevron-up' : 'chevron-down'}
            aria-hidden="true"
          />
        </div>
        {open ? (
          <div id={contentId} className="notifications-sample_content">
            {this.state.samplesView === 'similar'
              ? this.renderSimilar(sample, this.state.similar)
              : this.renderMatches(sample, this.state.matches)}
          </div>
        ) : null}
      </li>
    )
  }

  // Matches / Sounds like: the select-button tab row, in the open sample's header
  renderSampleViews(sample) {
    const views = [
      { key: 'matches', label: `Matches · ${sample.matchCount ?? 0}` },
      {
        key: 'similar',
        label: this.state.similar?.tracks?.length ? `Sounds like · ${this.state.similar.tracks.length}` : 'Sounds like',
      },
    ]
    return (
      <div
        className="select-button--container notifications-sample_views"
        role="group"
        aria-label={`Show for ${sample.filename}`}
      >
        {views.map(({ key, label }) => {
          const active = this.state.samplesView === key
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active ? 'true' : 'false'}
              className={`select_button-button notifications-sample_view${active ? ' select_button-button__active' : ''}`}
              onClick={() => this.setState({ samplesView: key })}
            >
              {label}
            </button>
          )
        })}
      </div>
    )
  }

  renderMatches(sample, matches) {
    if (matches === null) return <p className="notifications-hint">Loading…</p>
    if (matches.length === 0) {
      return (
        <p className="notifications-empty">
          No match yet. New tracks are checked against this sample as they arrive — see Sounds like.
        </p>
      )
    }
    return (
      <div
        className="notifications-list notifications-matches"
        role="table"
        aria-label={`Matches for ${sample.filename}`}
      >
        <div className="notifications-list_header" role="row">
          <span role="columnheader">New</span>
          <span role="columnheader">Artist</span>
          <span role="columnheader">Title</span>
          <span role="columnheader">Label</span>
          <span role="columnheader">Matched at</span>
          <span role="columnheader">Tempo</span>
          <span role="columnheader">Score</span>
        </div>
        {matches.map((match) => (
          <button
            key={match.match.previewId}
            type="button"
            role="row"
            className={`${this.rowClass(match.id)} notifications-list_row`}
            onClick={() => this.playMatch(match, sample)}
          >
            <span role="cell" className="notifications-list_new">
              <span
                className={match.unread ? 'new-dot' : 'new-dot new-dot--read'}
                aria-label={match.unread ? 'New' : 'Read'}
              />
            </span>
            <span role="cell" className="notifications-list_artist" data-label={labelsText(match)}>
              {artistsText(match)}
            </span>
            <span role="cell" className="notifications-list_title">
              {titleText(match)}
            </span>
            <span role="cell" className="notifications-list_label">
              {labelsText(match)}
            </span>
            <span role="cell" className="notifications-list_end matched-at">
              {formatSeconds(matchedAtInTrack(match.match.offsetSeconds, matchPreviewStartMs(match)))}
            </span>
            <span role="cell" className="notifications-list_end tempo">
              {formatTempo(match.match.tempoFactor)}
            </span>
            <span role="cell" className="notifications-list_end score">
              {match.match.score}
            </span>
          </button>
        ))}
      </div>
    )
  }

  renderSimilar(sample, similar) {
    if (similar === null) return <p className="notifications-hint">Loading…</p>
    if (similar.pending || similar.tracks.length === 0) {
      return <p className="notifications-empty">Similar tracks appear once the sample has been analysed.</p>
    }
    const follow = similar.follow.filter(({ type, id }) => !this.state.followed[`${type}:${id}`])
    const followGroups = [
      { type: 'artist', title: 'Artists' },
      { type: 'label', title: 'Labels' },
    ]
      .map((group) => ({ ...group, entities: follow.filter(({ type }) => type === group.type) }))
      .filter(({ entities }) => entities.length > 0)
    return (
      <>
        <p className="notifications-hint">
          Tracks that sound closest to the sample (audio similarity, not a fingerprint match).
        </p>
        <div
          className="notifications-list notifications-similar"
          role="table"
          aria-label={`Sounds like ${sample.filename}`}
        >
          <div className="notifications-list_header" role="row">
            <span role="columnheader">Artist</span>
            <span role="columnheader">Title</span>
            <span role="columnheader">Label</span>
            <span role="columnheader">Similarity</span>
          </div>
          {similar.tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              role="row"
              className={`${this.rowClass(track.id)} notifications-list_row`}
              onClick={() => this.playSimilar(track, sample)}
            >
              <span role="cell" className="notifications-list_artist" data-label={labelsText(track)}>
                {artistsText(track)}
              </span>
              <span role="cell" className="notifications-list_title">
                {titleText(track)}
              </span>
              <span role="cell" className="notifications-list_label">
                {labelsText(track)}
              </span>
              <span role="cell" className="notifications-list_end similarity">
                {Math.round(track.similarity * 100)} %
              </span>
            </button>
          ))}
        </div>
        {followGroups.length === 0 ? null : (
          <div className="notifications-follow">
            <h5 className="notifications-follow-title">Follow to catch it</h5>
            <p className="notifications-hint">
              New releases from followed artists and labels are checked against this sample. Ones you already follow are
              not suggested.
            </p>
            {followGroups.map(({ type, title, entities }) => (
              <section key={type} className="notifications-follow-group">
                <h6 className="notifications-follow-group-title">{title}</h6>
                <ul className="no-style-list notifications-follow-list">
                  {entities.map((entity) => (
                    <li key={`${entity.type}:${entity.id}`}>
                      <SpinnerButton
                        type="button"
                        size="large"
                        icon="heart"
                        loading={this.state.following === `${entity.type}:${entity.id}`}
                        disabled={this.state.following !== null}
                        onClick={() => this.follow(entity)}
                      >
                        Follow {entity.name}{' '}
                        <span className="notifications-follow-count">
                          · {entity.count} similar track{entity.count === 1 ? '' : 's'}
                        </span>
                      </SpinnerButton>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </>
    )
  }

  // The search as the top bar would serialise it: entity pills become artist:<id> / label:<id> and the like.
  newSearchText(committedTerms = this.state.newSearchTerms, inputValue = this.state.newSearchInput) {
    const typed = inputValue.trim() ? [{ type: 'text', value: inputValue.trim() }] : []
    return searchTermsToString([...committedTerms, ...typed])
  }

  // artist: / label: typed but not yet picked from the matches; it would only be added as plain text
  hasUnresolvedEntity(text = this.state.newSearchInput) {
    return /(^|\s)(artist|label):(?!\d+(\s|$))/i.test(text.trim())
  }

  async addSearch(text = this.newSearchText()) {
    if (!text || !this.props.emailVerified || this.state.addingSearch || this.hasUnresolvedEntity(text)) return
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
    const filter = this.state.subscriptionFilter
    // A group of subscriptions as pills, like the follows in Settings › Following, with Show all past the first ones
    const group = (key, title, items, emptyText) => {
      const { shown, matchingCount, totalCount, canExpand } = visibleSubscriptions(items, {
        filter,
        expanded: this.state.expandedGroups[key],
      })
      if (filter && matchingCount === 0) return null
      return (
        <section className="notifications-subscription-group" key={key} data-group={key}>
          <h4 className="notifications-section-title">
            {title}{' '}
            <span className="notifications-subscription-count">
              {filter ? `${matchingCount} of ${totalCount}` : totalCount}
            </span>
          </h4>
          {items.length === 0 ? (
            <p className="notifications-hint">{emptyText}</p>
          ) : (
            <ul className="no-style-list notifications-subscription-pills">
              {shown.map((item) => (
                <li key={item.text} className="notifications-subscription">
                  <span className="button pill pill-button">
                    <span className="pill-button-contents">
                      <NavLink to={`/search/?q=${encodeURIComponent(item.text)}`} className="notifications-subscription-name">
                        {item.displayName}
                      </NavLink>{' '}
                      {/* Like the bell on a followed artist: shows the state, and on hover the one a click switches to */}
                      <button
                        type="button"
                        className="followed-item_bell followed-item_bell--on"
                        aria-pressed="true"
                        aria-label={`Unsubscribe from ${item.displayName}`}
                        title={`Unsubscribe from ${item.displayName}`}
                        onClick={() =>
                          this.props.onRequestNotificationUpdate(
                            item.storeNames.map((storeName) => ({ op: 'remove', storeName, text: item.text })),
                          )
                        }
                      >
                        <FontAwesomeIcon className="followed-item_bell-current" icon="bell" />
                        <FontAwesomeIcon className="followed-item_bell-next" icon="bell-slash" />
                      </button>
                    </span>
                  </span>
                </li>
              ))}
              {canExpand || this.state.expandedGroups[key] ? (
                <li>
                  <button
                    type="button"
                    className="notifications-pill-toggle"
                    aria-expanded={this.state.expandedGroups[key] ? 'true' : 'false'}
                    onClick={() =>
                      this.setState({
                        expandedGroups: { ...this.state.expandedGroups, [key]: !this.state.expandedGroups[key] },
                      })
                    }
                  >
                    {this.state.expandedGroups[key] ? 'Show fewer' : `Show all ${matchingCount}`}
                  </button>
                </li>
              ) : null}
            </ul>
          )}
        </section>
      )
    }
    const hasSubscriptions = groups.searches.length + groups.artists.length + groups.labels.length > 0
    const visibleGroups = [
      group('searches', 'Searches', groups.searches, 'No search subscriptions.'),
      group('artists', 'Artists', groups.artists, 'Use the bell on a followed artist in Settings › Following.'),
      group('labels', 'Labels', groups.labels, 'Use the bell on a followed label in Settings › Following.'),
    ]
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
            // Picking an artist or label subscribes to it straight away, on its own
            entityTypes={['artist', 'label']}
            showEntitySearchStatus
            onEntitySelect={({ type, id }) => this.addSearch(`${type}:${id}`)}
            placeholder="Search text, or artist:Name / label:Name"
            styles="top_bar"
            className="notifications-add-search_bar"
            disabled={!this.props.emailVerified}
            loading={this.state.addingSearch}
          />
          <button
            type="button"
            className="button button-push_button button-push_button-small button-push_button-primary notifications-add-search_button"
            disabled={
              !this.props.emailVerified ||
              this.state.addingSearch ||
              !this.newSearchText() ||
              this.hasUnresolvedEntity()
            }
            onClick={() => this.addSearch()}
          >
            Add
          </button>
        </div>
        {/* The filter starts as a pill and turns into a field like the one above when clicked */}
        {hasSubscriptions ? (
          <div
            className="notifications-subscription-filter"
            ref={(el) => (this.subscriptionFilterContainer = el)}
            onKeyDown={(e) => e.key === 'Escape' && this.closeSubscriptionFilter()}
            // An empty field turns back into the pill once focus leaves it (not when it moves within, e.g. to clear)
            onBlur={(e) => {
              if (!this.state.subscriptionFilter.trim() && !e.currentTarget.contains(e.relatedTarget)) {
                this.closeSubscriptionFilter()
              }
            }}
          >
            {this.state.subscriptionFilterOpen ? (
              <SearchBar
                styles="top_bar"
                placeholder="Filter subscriptions"
                value={filter}
                onChange={({ target: { value } }) => this.setState({ subscriptionFilter: value })}
                onClearSearch={() => this.closeSubscriptionFilter()}
              />
            ) : (
              <button
                type="button"
                className="notifications-pill-toggle"
                onClick={() => this.setState({ subscriptionFilterOpen: true })}
              >
                <FontAwesomeIcon icon="magnifying-glass" /> Filter
              </button>
            )}
          </div>
        ) : null}
        <div className="notifications-subscription-groups">
          {visibleGroups}
          {filter && visibleGroups.every((g) => g === null) ? (
            <p className="notifications-empty">No subscriptions match “{filter}”.</p>
          ) : null}
        </div>
      </>
    )
  }

  render() {
    const { tab, unreadCount } = this.props
    return (
      <div className="page-container scroll-container notifications-page" style={this.props.style}>
        {/* The tabs sit in a bar like the cart controls above the cart track list */}
        <div className="top-bar input-layout notifications-top_bar">
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
                className={`select_button-button notifications-tab${
                  tab === key ? ' select_button-button__active notifications-tab--active' : ''
                }`}
              >
                {label}
                {key === 'activity' && unreadCount > 0 ? ` ${unreadCount}` : ''}
              </NavLink>
            ))}
          </div>
          {tab === 'activity' && this.state.events?.length ? this.renderMarkAllHeard() : null}
        </div>
        <div className="notifications-content">
          {tab === 'samples'
            ? this.renderSamples()
            : tab === 'subscriptions'
              ? this.renderSubscriptions()
              : this.renderActivity()}
        </div>
      </div>
    )
  }
}

export default NotificationsPage
