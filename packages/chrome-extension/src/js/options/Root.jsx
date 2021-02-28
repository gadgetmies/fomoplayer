import React from 'React'

export default class Root extends React.Component {
  constructor(props) {
    super(props)
    this.state = { enabledStores: {} }

    const that = this
    chrome.storage.local.get(['appUrl', 'enabledStores'], function({ appUrl, enabledStores }) {
      that.setState({ appUrl, storedAppUrl: appUrl, enabledStores })
    })

    this.toggleStore = this.toggleStore.bind(this)
    this.restoreAppUrl = this.restoreAppUrl.bind(this)
    this.saveAppUrl = this.saveAppUrl.bind(this)
    this.updateAppUrl = this.updateAppUrl.bind(this)
  }

  restoreAppUrl() {
    this.setState({ appUrl: this.state.storedAppUrl })
  }

  saveAppUrl() {
    chrome.storage.local.set({ appUrl: this.state.appUrl })
    this.setState({ storedAppUrl: this.state.appUrl })
  }

  updateAppUrl(e) {
    this.setState({ appUrl: e.target.value })
  }

  toggleStore(store) {
    return function(e) {
      const enabledStores = { ...this.state.enabledStores, [store]: !!e.target.checked }
      this.setState({ enabledStores })
      chrome.storage.local.set({ enabledStores })
    }.bind(this)
  }

  render() {
    return (
      <div>
        <h1>Multi Store Player Extension</h1>
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
      </div>
    )
  }
}
