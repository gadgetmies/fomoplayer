import * as R from 'ramda'
import React from 'react'

import Login from './Login.jsx'
import BeatportPanel from './BeatportPanel.jsx'
import BandcampPanel from './BandcampPanel.jsx'
import MultiStorePlayerPanel from './MultiStorePlayerPanel.jsx'
import Error from './Error.jsx'
import Status from './Status.jsx'

const getCurrentUrl = (tabArray) => tabArray[0].url
const getCurrentHostname = (tabArray) => getCurrentUrl(tabArray)

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
      carts: [],
      selectedCartId: undefined,
      selectedCartTracks: [],
    }

    const that = this
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (message.type === 'login') {
        that.setState({ loggedIn: message.success })
      } else if (message.type === 'logout') {
        that.setState({ loggedIn: false })
      } else if (message.type === 'done') {
        that.setRunning(false)
      } else if (message.type === 'error') {
        that.setState({ error: message })
      } else if (message.type === 'carts') {
        const carts = message.data
        that.setState({ carts: carts, selectedCartId: carts[0].id })
      } else if (message.type === 'selectedCartTracks') {
        const selectedCartTracks = message.data.tracks
        console.log({ selectedCartTracks })
        that.setState({ selectedCartTracks })
      }

      that.refresh()
    })

    this.refresh = this.refresh.bind(this)
    this.setRunning = this.setRunning.bind(this)
    this.refresh()
    chrome.runtime.sendMessage({ type: 'refreshCarts' })
  }

  refresh() {
    const that = this
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabArray) {
      chrome.storage.local.get(
        ['running', 'token', 'enabledStores', 'appUrl', 'error', 'operationStatus', 'operationProgress'],
        function ({ running, token, enabledStores, appUrl, error, operationStatus, operationProgress }) {
          const currentHostname = getCurrentHostname(tabArray)

          const panels = [
            {
              matcher: new RegExp(`^${appUrl}`),
              component: MultiStorePlayerPanel,
              key: 'MultiStorePlayerPanel',
            },
            {
              storeName: 'beatport',
              matcher: /^https:\/\/.*\.beatport\.com/,
              component: BeatportPanel,
              key: 'BeatportPanel',
            },
            {
              storeName: 'bandcamp',
              matcher: /^https:\/\/.*\.?bandcamp\.com/,
              key: 'BandcampPanel',
              component: BandcampPanel,
            },
          ]

          that.setState({
            loggedIn: token !== undefined,
            currentHostname,
            running,
            enabledStores,
            panels,
            appUrl,
            error,
            operationStatus,
            operationProgress,
          })
        },
      )
    })
  }

  setRunning(state) {
    chrome.storage.local.set({ running: state }, () => this.setState({ running: state }))
  }

  render() {
    const panelProps = {
      setRunning: this.setRunning,
      running: this.state.running,
      appUrl: this.state.appUrl,
      operationStatus: this.state.operationStatus,
      operationProgress: this.state.operationProgress,
      carts: this.state.carts,
      selectedCartTracks: this.state.selectedCartTracks,
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
        <button onClick={() => chrome.storage.local.clear(() => this.setState({ running: false, loggedIn: false }))}>
          Reset
        </button>
        {this.state.error ? (
          <Error error={this.state.error} />
        ) : !this.state.loggedIn ? (
          <Login />
        ) : (
          <>
            {this.state.running ? (
              <Status message={this.state.operationStatus} progress={this.state.operationProgress} />
            ) : null}
            {components.map((component) => {
              return React.createElement(component.component, {
                isCurrent: component === current,
                ...panelProps,
                key: component.key,
              })
            })}
          </>
        )}
      </>
    )
  }
}
