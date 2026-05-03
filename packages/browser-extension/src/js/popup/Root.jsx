import * as R from 'ramda'
import React from 'react'

import browser from '../browser'
import Login from './Login.jsx'
import BeatportPanel from './BeatportPanel.jsx'
import BandcampPanel from './BandcampPanel.jsx'
import MultiStorePlayerPanel from './MultiStorePlayerPanel.jsx'
import Error from './Error.jsx'
import Status from './Status.jsx'

const getCurrentHostname = (tabArray) => (tabArray[0] && tabArray[0].url) || ''

export default class Root extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      running: true,
      loggedIn: false,
      currentHostname: '',
      enabledStores: {},
      panels: [],
      error: null,
    }

    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'login') {
        this.setState({ loggedIn: message.success })
      } else if (message.type === 'logout') {
        this.setState({ loggedIn: false })
      } else if (message.type === 'done') {
        this.setRunning(false)
      } else if (message.type === 'error') {
        this.setState({ error: message })
      }
      this.refresh()
    })

    this.refresh = this.refresh.bind(this)
    this.setRunning = this.setRunning.bind(this)
    this.handleReset = this.handleReset.bind(this)
    this.refresh()
  }

  async refresh() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const stored = await browser.storage.local.get([
      'running',
      'refreshToken',
      'enabledStores',
      'appUrl',
      'error',
      'operationStatus',
      'operationProgress',
    ])
    const currentHostname = getCurrentHostname(tabs)
    const resolvedAppUrl = stored.appUrl || DEFAULT_APP_URL

    const panels = [
      { matcher: new RegExp(`^${resolvedAppUrl}`), component: MultiStorePlayerPanel },
      { storeName: 'beatport', matcher: /^https:\/\/.*\.beatport\.com/, component: BeatportPanel },
      { storeName: 'bandcamp', matcher: /^https:\/\/.*\.?bandcamp\.com/, component: BandcampPanel },
    ]

    this.setState({
      loggedIn: stored.refreshToken !== undefined,
      currentHostname,
      running: stored.running,
      enabledStores: stored.enabledStores,
      panels,
      appUrl: resolvedAppUrl,
      error: stored.error,
      operationStatus: stored.operationStatus,
      operationProgress: stored.operationProgress,
    })
  }

  async setRunning(state) {
    await browser.storage.local.set({ running: state })
    this.setState({ running: state })
  }

  async handleReset() {
    try {
      await browser.runtime.sendMessage({ type: 'logging-out' })
    } catch (e) {
      console.warn('Logout broadcast failed during reset', e)
    }
    await browser.storage.local.clear()
    this.setState({ running: false, loggedIn: false })
  }

  render() {
    const panelProps = {
      setRunning: this.setRunning,
      running: this.state.running,
      appUrl: this.state.appUrl,
      operationStatus: this.state.operationStatus,
      operationProgress: this.state.operationProgress,
    }

    const enabledPanels = this.state.panels.filter((panel) => {
      const enabled = R.path(['enabledStores', panel.storeName], this.state)
      return enabled !== undefined ? enabled : true
    })

    const current = enabledPanels.find((panel) => this.state.currentHostname.match(panel.matcher))
    const rest = R.without([current], enabledPanels)
    const components = current ? [current, ...rest] : rest

    return (
      <>
        <button onClick={this.handleReset}>Reset</button>
        {this.state.error ? (
          <Error error={this.state.error} />
        ) : !this.state.loggedIn ? (
          <Login />
        ) : (
          <>
            {this.state.running ? (
              <Status message={this.state.operationStatus} progress={this.state.operationProgress} />
            ) : null}
            {components.map((component) =>
              React.createElement(component.component, { isCurrent: component === current, ...panelProps }),
            )}
          </>
        )}
      </>
    )
  }
}
