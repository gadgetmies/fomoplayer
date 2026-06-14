import React from 'react'
import browser from '../../browser'

const CART_PUSH_RUN_KEY = 'cartPushRun'
const BATCH_SIZE_KEY = 'bandcampCartPushBatchSize'

const STORE_LABELS = { beatport: 'Beatport', bandcamp: 'Bandcamp' }

const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'cart'

const pad2 = (n) => String(n).padStart(2, '0')
const filenameStamp = (iso) => {
  const d = iso ? new Date(iso) : new Date()
  return (
    String(d.getFullYear()) +
    pad2(d.getMonth() + 1) +
    pad2(d.getDate()) +
    '-' +
    pad2(d.getHours()) +
    pad2(d.getMinutes())
  )
}

const formatTrackLine = (t) => {
  const head = `${t.artist || 'Unknown'} — ${t.title || ''}`.trim()
  if (t.status || t.error) {
    return `${head} (status: ${t.status ?? ''}, error: ${t.error ?? ''})`
  }
  return head
}

const buildSkippedFailedText = (run) => {
  const notOn = (run?.results?.notOnStore || []).map(formatTrackLine)
  const failed = (run?.results?.failed || []).map(formatTrackLine)
  return [...notOn, ...failed].join('\n')
}

const buildFullSummaryText = (run) => {
  const storeLabel = STORE_LABELS[run.store] || run.store
  const lines = []
  lines.push(`Fomo Player → ${storeLabel} cart push`)
  lines.push(`Fomo Player cart: ${run.fomoplayerCartName || ''}`)
  if (run.beatportCartName) lines.push(`Beatport cart: ${run.beatportCartName}`)
  lines.push(`Started: ${run.startedAt || ''}`)
  if (run.completedAt) lines.push(`Completed: ${run.completedAt}`)
  lines.push('')

  const renderBucket = (label, items) => {
    lines.push(`# ${label} (${items.length})`)
    for (const t of items) lines.push(formatTrackLine(t))
    lines.push('')
  }
  const r = run.results || {}
  renderBucket(
    run.store === 'bandcamp' ? 'Tabs opened' : 'Added',
    r.added || [],
  )
  if (run.store === 'beatport') renderBucket('Already in cart', r.alreadyInCart || [])
  renderBucket(`Not on ${storeLabel}`, r.notOnStore || [])
  renderBucket('Failed', r.failed || [])
  return lines.join('\n')
}

export default class CartPushSection extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      run: null,
      batchSize: 10,
      carts: [],
      selectedCartId: '',
      expanded: {}, // bucket -> bool
      loading: false,
    }
    this.handleStorageChanged = this.handleStorageChanged.bind(this)
    this.handleStart = this.handleStart.bind(this)
    this.handleOpenNext = this.handleOpenNext.bind(this)
    this.handleDismiss = this.handleDismiss.bind(this)
    this.handleCopy = this.handleCopy.bind(this)
    this.handleDownload = this.handleDownload.bind(this)
  }

  async componentDidMount() {
    const stored = await browser.storage.local.get([CART_PUSH_RUN_KEY, BATCH_SIZE_KEY])
    this.setState({
      run: stored?.[CART_PUSH_RUN_KEY] || null,
      batchSize: stored?.[BATCH_SIZE_KEY] === undefined ? 10 : stored[BATCH_SIZE_KEY],
    })
    browser.storage.onChanged.addListener(this.handleStorageChanged)
    await this.loadCarts()
  }

  componentWillUnmount() {
    if (browser.storage.onChanged.removeListener) {
      browser.storage.onChanged.removeListener(this.handleStorageChanged)
    }
  }

  handleStorageChanged(changes, areaName) {
    if (areaName !== 'local') return
    if (changes[CART_PUSH_RUN_KEY]) {
      this.setState({ run: changes[CART_PUSH_RUN_KEY].newValue || null })
    }
    if (changes[BATCH_SIZE_KEY]) {
      const v = changes[BATCH_SIZE_KEY].newValue
      this.setState({ batchSize: v === undefined ? 10 : v })
    }
  }

  async loadCarts() {
    try {
      const res = await browser.runtime.sendMessage({ type: 'cart-push:list-fomo-carts' })
      if (res?.ok) {
        this.setState({ carts: res.carts || [] })
      }
    } catch (e) {
      // Service worker may be unauthenticated — picker stays empty.
    }
  }

  async handleStart() {
    const { store } = this.props
    const { selectedCartId } = this.state
    if (!selectedCartId) return
    this.setState({ loading: true })
    try {
      await browser.runtime.sendMessage({
        type: 'cart-push:start',
        store,
        fomoplayerCartId: Number(selectedCartId),
      })
    } finally {
      this.setState({ loading: false })
    }
  }

  async handleOpenNext() {
    await browser.runtime.sendMessage({ type: 'cart-push:open-next-batch' })
  }

  async handleDismiss() {
    await browser.runtime.sendMessage({ type: 'cart-push:dismiss' })
  }

  async handleCopy() {
    const text = buildSkippedFailedText(this.state.run)
    try {
      await navigator.clipboard.writeText(text)
    } catch (e) {
      console.warn('Clipboard write failed', e)
    }
  }

  handleDownload() {
    const { run } = this.state
    if (!run) return
    const text = buildFullSummaryText(run)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const stamp = filenameStamp(run.completedAt)
    const cartSlug = slugify(run.fomoplayerCartName)
    const name = `fomo-push-${run.store}-${cartSlug}-${stamp}.txt`
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  toggleExpanded(key) {
    this.setState((s) => ({ expanded: { ...s.expanded, [key]: !s.expanded[key] } }))
  }

  renderBucketList(label, items, key) {
    if (!items || items.length === 0) return null
    const isOpen = !!this.state.expanded[key]
    return (
      <div className="cart-push-bucket">
        <div className="cart-push-bucket-head">
          <strong>{label}:</strong> {items.length}{' '}
          {label === 'Added' || label === 'Tabs opened' ? null : (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                this.toggleExpanded(key)
              }}
            >
              [{isOpen ? 'hide' : 'show'}]
            </a>
          )}
        </div>
        {isOpen && (
          <ul className="cart-push-bucket-list">
            {items.map((t, i) => (
              <li key={`${key}-${i}`}>
                {t.fomoplayerUrl ? (
                  <a href={t.fomoplayerUrl} target="_blank" rel="noreferrer">
                    {t.artist} — {t.title}
                  </a>
                ) : (
                  <span>{t.artist} — {t.title}</span>
                )}
                {t.status || t.error ? (
                  <span className="cart-push-error"> (status: {t.status ?? ''}, error: {t.error ?? ''})</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  renderRunningState() {
    const { run } = this.state
    if (run.store === 'beatport') {
      const total = (run.queue || []).length
      const processed = run.processed || 0
      return (
        <p className="cart-push-progress">
          Pushing "{run.beatportCartName}" — {processed} / {total}
        </p>
      )
    }
    // Bandcamp running before first batch is opened — rare transient state.
    return <p className="cart-push-progress">Opening Bandcamp tabs…</p>
  }

  renderAwaitingNextBatch() {
    const { run } = this.state
    const opened = (run.results?.added || []).length
    return (
      <div>
        <p className="cart-push-progress">
          Batch {run.batchIndex + 1} / {run.batchCount} open ({opened} tabs)
        </p>
        <button onClick={this.handleOpenNext}>Open next batch</button>
      </div>
    )
  }

  renderSummary() {
    const { run } = this.state
    const storeLabel = STORE_LABELS[run.store] || run.store
    const r = run.results || {}
    return (
      <div className="cart-push-summary">
        <h4>Push complete</h4>
        {this.renderBucketList(
          run.store === 'bandcamp' ? 'Tabs opened' : 'Added',
          r.added || [],
          'added',
        )}
        {run.store === 'beatport' && this.renderBucketList('Already in cart', r.alreadyInCart || [], 'alreadyInCart')}
        {this.renderBucketList(`Not on ${storeLabel}`, r.notOnStore || [], 'notOnStore')}
        {this.renderBucketList('Failed', r.failed || [], 'failed')}
        <div className="cart-push-actions">
          <button onClick={this.handleCopy}>Copy skipped+failed</button>
          <button onClick={this.handleDownload}>Download as text</button>
          <button onClick={this.handleDismiss}>Dismiss</button>
        </div>
      </div>
    )
  }

  renderFailureSummary() {
    const { run } = this.state
    return (
      <div className="cart-push-summary cart-push-summary--failed">
        <p>
          <strong>Push failed:</strong> {run.error}
        </p>
        <button onClick={this.handleDismiss}>Dismiss</button>
      </div>
    )
  }

  renderStartUi() {
    const { store, isCurrent } = this.props
    const { carts, selectedCartId, loading } = this.state
    if (!isCurrent) return null
    const cartsForPicker = carts || []
    const buttonLabel =
      store === 'beatport'
        ? selectedCartId
          ? `Push to Beatport cart "FOMO: ${(cartsForPicker.find((c) => String(c.id) === String(selectedCartId)) || {}).name || ''}"`
          : 'Push to Beatport cart'
        : 'Open tabs to push to Bandcamp'
    return (
      <div className="cart-push-start">
        <label>
          Fomo Player cart:
          <br />
          <select
            value={selectedCartId}
            onChange={(e) => this.setState({ selectedCartId: e.target.value })}
            disabled={loading}
          >
            <option value="">— pick a cart —</option>
            {cartsForPicker.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_default ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button onClick={this.handleStart} disabled={loading || !selectedCartId}>
          {buttonLabel}
        </button>
      </div>
    )
  }

  render() {
    const { store } = this.props
    const { run } = this.state
    const otherStoreLabel = store === 'beatport' ? 'Bandcamp' : 'Beatport'

    return (
      <div className="cart-push-section">
        <h3>Push Fomo Player cart</h3>
        {run && run.store === store ? (
          <>
            {run.status === 'running' && this.renderRunningState()}
            {run.status === 'awaiting-next-batch' && this.renderAwaitingNextBatch()}
            {run.status === 'completed' && this.renderSummary()}
            {run.status === 'failed' && this.renderFailureSummary()}
          </>
        ) : run && run.status !== 'completed' && run.status !== 'failed' ? (
          <p className="cart-push-other-store-hint">
            A {run.store === 'beatport' ? 'Beatport' : 'Bandcamp'} push is in progress — wait or
            dismiss it before starting another.
          </p>
        ) : (
          this.renderStartUi()
        )}
      </div>
    )
  }
}
