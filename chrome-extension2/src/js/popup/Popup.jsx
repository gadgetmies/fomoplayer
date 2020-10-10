import * as R from 'ramda'
import React from 'React'

import Login from './Login.jsx'
import MultiStorePlayer from './MultiStorePlayerPanel.jsx'
import BeatportPanel from './BeatportPanel.jsx'
import BandcampPanel from './BandcampPanel.jsx'

const panels = [
  {
    matcher: PLAYER_UI_MATCHER,
    component: MultiStorePlayer
  },
  {
    matcher: /^https:\/\/.*\.beatport\.com/,
    component: BeatportPanel
  },
  {
    matcher: /^https:\/\/.*\.?bandcamp\.com/,
    component: BandcampPanel
  }
]

const getCurrentUrl = tabArray => tabArray[0].url
const getCurrentHostname = tabArray => {
  console.log(new URL(getCurrentUrl(tabArray)).origin)
  return new URL(getCurrentUrl(tabArray)).origin
}

export default class Popup extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      running: true,
      loggedIn: false,
      currentHostname: ''
    }

    const that = this

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      console.log(message)
      if (message.type === 'login') {
        that.setState({ loggedIn: message.success })
      } else if (message.type === 'logout') {
        that.setState({ loggedIn: false })
      } else if (message.type === 'done') {
        that.setRunning(false)
      }
    })

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabArray) {
      chrome.storage.local.get(['running', 'token'], function({ running, token }) {
        const currentHostname = getCurrentHostname(tabArray)
        that.setState({ loggedIn: token !== undefined, currentHostname, running })
      })
    })
  }

  setRunning(state) {
    chrome.storage.local.set({ running: state }, () => this.setState({ running: state }))
  }

  render() {
    console.log(this.state)
    const panelProps = { setRunning: this.setRunning.bind(this), running: this.state.running }
    const current = panels.find(panel => {
      console.log(panel.matcher.toString())
      return this.state.currentHostname.match(panel.matcher)
    })
    const currentComponent = current
      ? current.component({ isCurrent: true, ...panelProps, key: current.matcher.toString() })
      : null
    const rest = R.without([current], panels).map(({ component, matcher }) =>
      component({ isCurrent: false, ...panelProps, key: matcher.toString() })
    )
    return (
      <>
        <button
          onClick={() =>
            chrome.storage.local.clear(() => {
              console.log('Logging out')
              this.setState({ running: false, loggedIn: false })
            })
          }
        >
          Reset
        </button>
        {!this.state.loggedIn ? <Login /> : [currentComponent, ...rest]}
      </>
    )
  }
}
