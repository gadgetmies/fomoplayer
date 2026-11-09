import React from 'react'
import browser from '../browser'
import { normalizeAppUrl } from '../app-url'

const BATCH_SIZE_KEY = 'bandcampCartPushBatchSize'

const validateBatchSizeInput = (raw) => {
  const trimmed = String(raw ?? '').trim()
  if (trimmed === '') return { ok: true, value: null }
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: 'Enter a positive integer or leave blank.' }
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n <= 0) return { ok: false, error: 'Enter a positive integer or leave blank.' }
  return { ok: true, value: n }
}

const batchSizeInputValue = (stored) => {
  if (stored === null) return ''
  if (stored === undefined) return '10'
  return String(stored)
}

export default class Root extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      enabledStores: {},
      hideBandcampNativePlay: true,
      batchSizeInput: '10',
      batchSizeStored: 10,
      batchSizeError: null,
    }

    browser.storage.local
      .get(['appUrl', 'enabledStores', 'hideBandcampNativePlay', BATCH_SIZE_KEY])
      .then(({ appUrl, enabledStores, hideBandcampNativePlay, [BATCH_SIZE_KEY]: rawBatchSize }) => {
        const resolvedAppUrl = appUrl || DEFAULT_APP_URL
        // The service worker init defaults `bandcampCartPushBatchSize` to 10
        // on first install. If we still see `undefined` here, the user
        // opened Options before the worker booted — render `10` and write
        // it on first save.
        const batchSizeStored = rawBatchSize === undefined ? 10 : rawBatchSize
        this.setState({
          appUrl: resolvedAppUrl,
          storedAppUrl: resolvedAppUrl,
          enabledStores: enabledStores || { beatport: true, bandcamp: true },
          hideBandcampNativePlay: hideBandcampNativePlay === undefined ? true : !!hideBandcampNativePlay,
          batchSizeInput: batchSizeInputValue(batchSizeStored),
          batchSizeStored,
        })
      })

    this.toggleStore = this.toggleStore.bind(this)
    this.toggleHideBandcampNativePlay = this.toggleHideBandcampNativePlay.bind(this)
    this.restoreAppUrl = this.restoreAppUrl.bind(this)
    this.saveAppUrl = this.saveAppUrl.bind(this)
    this.updateAppUrl = this.updateAppUrl.bind(this)
    this.updateBatchSizeInput = this.updateBatchSizeInput.bind(this)
    this.saveBatchSize = this.saveBatchSize.bind(this)
  }

  toggleHideBandcampNativePlay(e) {
    const hideBandcampNativePlay = !!e.target.checked
    this.setState({ hideBandcampNativePlay })
    browser.storage.local.set({ hideBandcampNativePlay })
  }

  restoreAppUrl() {
    this.setState({ appUrl: this.state.storedAppUrl })
  }

  saveAppUrl() {
    // Strip any trailing slash before storing — paths are concatenated as
    // `${appUrl}${path}`, so a trailing slash would produce a double slash.
    const appUrl = normalizeAppUrl(this.state.appUrl)
    browser.storage.local.set({ appUrl })
    this.setState({ appUrl, storedAppUrl: appUrl })
  }

  updateAppUrl(e) {
    this.setState({ appUrl: e.target.value })
  }

  toggleStore(store) {
    return (e) => {
      const enabledStores = { ...this.state.enabledStores, [store]: !!e.target.checked }
      this.setState({ enabledStores })
      browser.storage.local.set({ enabledStores })
    }
  }

  updateBatchSizeInput(e) {
    this.setState({ batchSizeInput: e.target.value, batchSizeError: null })
  }

  async saveBatchSize() {
    const validation = validateBatchSizeInput(this.state.batchSizeInput)
    if (!validation.ok) {
      // Revert to last valid stored value, show inline error, do not write.
      this.setState({
        batchSizeInput: batchSizeInputValue(this.state.batchSizeStored),
        batchSizeError: validation.error,
      })
      return
    }
    await browser.storage.local.set({ [BATCH_SIZE_KEY]: validation.value })
    this.setState({
      batchSizeStored: validation.value,
      batchSizeInput: batchSizeInputValue(validation.value),
      batchSizeError: null,
    })
  }

  render() {
    const batchSizeDirty = batchSizeInputValue(this.state.batchSizeStored) !== this.state.batchSizeInput
    return (
      <div>
        <h1>Fomo Player Extension</h1>
        <p>
          <label>
            App URL:
            <br />
            <input type="text" value={this.state.appUrl} onChange={this.updateAppUrl} size="40" />
          </label>
          <button onClick={this.restoreAppUrl} disabled={this.state.appUrl === this.state.storedAppUrl}>
            Cancel
          </button>
          <button onClick={this.saveAppUrl} disabled={this.state.appUrl === this.state.storedAppUrl}>
            Apply
          </button>
        </p>
        <fieldset>
          <legend>Enabled stores</legend>
          <div className="checkbox">
            <input
              id="bandcamp-checkbox"
              type="checkbox"
              onChange={this.toggleStore('bandcamp')}
              checked={this.state.enabledStores.bandcamp}
            />
            <label htmlFor="bandcamp-checkbox" className="noselect">
              <span>Bandcamp</span>
            </label>
          </div>
          <div className="checkbox">
            <input
              id="beatport-checkbox"
              type="checkbox"
              onChange={this.toggleStore('beatport')}
              checked={this.state.enabledStores.beatport}
            />
            <label htmlFor="beatport-checkbox" className="noselect">
              <span>Beatport</span>
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Bandcamp</legend>
          <div className="checkbox">
            <input
              id="hide-bandcamp-native-play-checkbox"
              type="checkbox"
              onChange={this.toggleHideBandcampNativePlay}
              checked={this.state.hideBandcampNativePlay}
            />
            <label htmlFor="hide-bandcamp-native-play-checkbox" className="noselect">
              <span>Hide Bandcamp's native play button</span>
            </label>
          </div>
          <div>
            <label htmlFor="bandcamp-cart-push-batch-size">
              Bandcamp cart-push batch size:
            </label>
            <br />
            <input
              id="bandcamp-cart-push-batch-size"
              type="number"
              min="1"
              step="1"
              value={this.state.batchSizeInput}
              onChange={this.updateBatchSizeInput}
            />
            <button onClick={this.saveBatchSize} disabled={!batchSizeDirty}>
              Apply
            </button>
            {this.state.batchSizeError && (
              <div className="cart-push-batch-size-error" style={{ color: '#c00', fontSize: '0.85em' }}>
                {this.state.batchSizeError}
              </div>
            )}
            <p style={{ fontSize: '0.8em', color: '#666' }}>
              When you push a Fomo Player cart to Bandcamp, the extension opens one background
              tab per track. This setting controls how many tabs open at once before you click
              "Open next batch". Leave blank to open all tabs at once — note that big carts can
              freeze the browser if you do.
            </p>
          </div>
        </fieldset>
      </div>
    )
  }
}
