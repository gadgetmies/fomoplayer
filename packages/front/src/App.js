import React, { Component } from 'react'
import * as R from 'ramda'
import { BrowserRouter as Router, Route } from 'react-router-dom'
import Login from './UserLogin.js'
import Menu from './Menu.js'
import Player from './Player.js'
import './App.css'
import SlideoutPanel from './SlideoutPanel.js'
import Settings from './Settings.js'
import Spinner from './Spinner.js'

import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials.js'
import config from './config.js'

import 'typeface-lato'
import { library } from '@fortawesome/fontawesome-svg-core'
import { faGithub, faChrome, faYoutube } from '@fortawesome/free-brands-svg-icons'
import {
  faHeart,
  faHeartBroken,
  faPlus,
  faMinus,
  faTimesCircle,
  faCopy,
  faBars,
  faExternalLinkAlt,
  faBan,
  faExclamationCircle,
  faForward,
  faBackward,
  faPlay,
  faStepForward,
  faStepBackward,
  faPause,
  faKeyboard,
  faCircle,
  faInfoCircle,
  faClipboard,
  faClipboardCheck,
  faCaretDown,
  faBell,
  faBellSlash,
  faSearch
} from '@fortawesome/free-solid-svg-icons'

library.add(
  faHeart,
  faHeartBroken,
  faPlus,
  faMinus,
  faTimesCircle,
  faCopy,
  faBars,
  faExternalLinkAlt,
  faBan,
  faExclamationCircle,
  faForward,
  faBackward,
  faPlay,
  faStepForward,
  faStepBackward,
  faPause,
  faKeyboard,
  faGithub,
  faChrome,
  faYoutube,
  faCircle,
  faInfoCircle,
  faClipboard,
  faClipboardCheck,
  faCaretDown,
  faBell,
  faBellSlash,
  faSearch
)
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

// import injectTapEventPlugin from 'react-tap-event-plugin';
// injectTapEventPlugin();

const defaultTracksData = { tracks: { new: [], heard: [] }, meta: { totalTracks: 0, newTracks: 0 } }

const Root = props => <div className="root" style={{ height: '100%', overflow: 'hidden' }} {...props} />

class App extends Component {
  constructor(props) {
    super(props)
    this.state = {
      addingToCart: false,
      slideout: null,
      carts: {},
      scoreWeights: {},
      notifications: [],
      loggedIn: false,
      loading: true,
      tracksData: defaultTracksData,
      initialPosition: NaN,
      processingCart: false,
      userSettings: {}
    }
  }

  async updateStatesFromServer() {
    await Promise.all([
      this.updateCarts(),
      this.updateScoreWeights(),
      this.updateTracks(),
      this.updateFollows(),
      this.updateNotifications(),
      this.updateSettings()
    ])
  }

  async componentDidMount() {
    let cartString = '/cart/'
    if (window.location.pathname.startsWith(cartString)) {
      const uuid = window.location.pathname.substring(cartString.length)
      const position = parseInt(window.location.hash.substring(1))
      const list = await requestJSONwithCredentials({
        path: `/carts/${uuid}`
      })

      this.setState({ list, initialPosition: position })
    } else {
      try {
        await this.updateStatesFromServer()
        this.setState({ loggedIn: true })
      } catch (e) {
        console.error(e)
        this.setState({ loggedIn: false })
      }
    }

    this.setState({ loading: false })
  }

  async onLoginDone() {
    this.setState({ loggedIn: true })
    await this.updateStatesFromServer()
  }

  onLogoutDone() {
    this.setState({ loggedIn: false, tracksData: defaultTracksData })
  }

  async updateCarts() {
    const carts = await requestJSONwithCredentials({
      path: `/me/carts`
    })
    this.setState({ carts })
  }

  async updateScoreWeights() {
    const scoreWeights = await requestJSONwithCredentials({
      path: '/me/score-weights'
    })
    this.setState({ scoreWeights })
  }

  async addToCart(cartId, trackId) {
    this.setState({ addingToCart: true })
    const cartDetails = await requestJSONwithCredentials({
      path: `/me/carts/${cartId}/tracks`,
      method: 'PATCH',
      body: [{ op: 'add', trackId }]
    })

    this.updateCart(cartDetails)
    this.setState({ addingToCart: false })
  }

  async removeFromCart(cartId, trackId) {
    const cartDetails = await requestJSONwithCredentials({
      path: `/me/carts/${cartId}/tracks`,
      method: 'PATCH',
      body: [{ op: 'remove', trackId }]
    })

    this.updateCart(cartDetails)
  }

  async onMarkPurchased(trackId) {
    this.setState({ processingCart: true })
    await requestWithCredentials({
      path: `/me/carts/`,
      method: 'PATCH',
      body: [{ op: 'remove', trackId }]
    })
    await requestJSONwithCredentials({
      path: `/me/purchased/`,
      method: 'POST',
      body: [{ trackId }]
    })
    await Promise.all([this.updateCarts(), this.updateTracks()])
    this.setState({ processingCart: false })
  }

  updateCart(cartDetails) {
    const index = this.state.carts.findIndex(R.propEq('id', cartDetails.id))
    const clonedCarts = this.state.carts.slice()
    clonedCarts[index] = cartDetails
    this.setState({ carts: clonedCarts })
  }

  async updateFollows() {
    const [artists, labels] = await Promise.all([
      requestJSONwithCredentials({
        path: `/me/follows/artists`
      }),
      await requestJSONwithCredentials({
        path: `/me/follows/labels`
      })
    ])
    this.setState({ follows: { artists, labels } })
  }

  async requestNotification(search) {
    await requestWithCredentials({
      path: `/me/notifications`,
      method: 'POST',
      body: { search }
    })

    await this.updateNotifications()
  }

  async removeNotification(notificationId) {
    await requestWithCredentials({
      path: `/me/notifications/${notificationId}`,
      method: 'DELETE'
    })

    await this.updateNotifications()
  }

  async updateNotifications() {
    this.setState({ notifications: await requestJSONwithCredentials({ path: '/me/notifications' }) })
  }

  async updateTracks() {
    const {
      meta: { new: newTracks, total: totalTracks },
      tracks
    } = await requestJSONwithCredentials({
      path: `/me/tracks`
    })

    this.setState({ tracksData: { tracks, meta: { newTracks, totalTracks } } })
  }

  async markHeard(interval) {
    await requestWithCredentials({
      path: `/me/tracks?interval=${interval}`,
      method: 'PATCH',
      body: { heard: true }
    })
    await this.updateTracks()
  }

  async updateEmail(email) {
    await requestWithCredentials({
      path: `/me/settings`,
      method: 'POST',
      body: { email }
    })
    await this.updateSettings()
  }

  async updateSettings() {
    const userSettings = await requestJSONwithCredentials({
      path: `/me/settings`
    })
    this.setState({ userSettings })
  }

  async updateLogins() {}

  render() {
    return (
      <Root>
        <Router>
          {this.state.loading ? (
            <div className="loading-overlay">
              🚀 Launching app
              <Spinner />
            </div>
          ) : this.state.loggedIn ? (
            <>
              <Menu
                ref="menu"
                logoutPath={`/auth/logout`}
                loggedIn={this.state.loggedIn}
                onNavButtonClicked={() => {
                  this.refs['slideout'].toggle()
                }}
                onLogoutDone={this.onLogoutDone.bind(this)}
                onStoreLoginDone={() => {}} //this.onStoreLoginDone.bind(this)}
                onUpdateTracks={this.updateTracks.bind(this)}
              />
              <SlideoutPanel ref="slideout" onOpen={this.updateLogins.bind(this)}>
                <button
                  style={{ position: 'absolute', left: 0, margin: 10, color: 'white', zIndex: 11 }}
                  onClick={() => {
                    this.refs['slideout'].toggle()
                  }}
                >
                  <FontAwesomeIcon icon="bars" />
                </button>
                <Route
                  path="/"
                  render={() => (
                    <Player
                      mode="app"
                      initialPosition={NaN}
                      addingToCart={this.state.addingToCart}
                      onUpdateTracksClicked={this.updateTracks.bind(this)}
                      carts={this.state.carts}
                      notifications={this.state.notifications}
                      onRequestNotification={this.requestNotification.bind(this)}
                      onRemoveNotification={this.removeNotification.bind(this)}
                      follows={this.state.follows}
                      tracks={this.state.tracksData.tracks}
                      newTracks={this.state.tracksData.meta.newTracks}
                      totalTracks={this.state.tracksData.meta.totalTracks}
                      onAddToCart={this.addToCart.bind(this)}
                      onRemoveFromCart={this.removeFromCart.bind(this)}
                      onMarkPurchased={this.onMarkPurchased.bind(this)}
                      onFollow={this.updateFollows.bind(this)}
                      processingCart={this.state.processingCart}
                    />
                  )}
                />
                <Route
                  exact
                  path="/settings"
                  render={() => (
                    <Settings
                      carts={this.state.carts}
                      onUpdateCarts={this.updateCarts.bind(this)}
                      notifications={this.state.notifications}
                      onRequestNotification={this.requestNotification.bind(this)}
                      onRemoveNotification={this.removeNotification.bind(this)}
                      onMarkHeardClicked={this.markHeard.bind(this)}
                      onUpdateEmail={this.updateEmail.bind(this)}
                      newTracks={this.state.tracksData.meta.newTracks}
                      totalTracks={this.state.tracksData.meta.totalTracks}
                      userSettings={this.state.userSettings}
                      scoreWeights={this.state.scoreWeights}
                      tracks={this.state.tracksData.tracks}
                      follows={this.state.follows}
                    />
                  )}
                />
              </SlideoutPanel>
            </>
          ) : this.state.list ? (
            <Player
              mode="list"
              carts={[this.state.list]}
              initialPosition={this.state.initialPosition}
              notifications={this.state.notifications}
            />
          ) : (
            <div className="align-center-container full-screen-popup-container">
              <div className="full-screen-popup">
                <h1 style={{ marginTop: 0, textAlign: 'center' }}>Login</h1>
                <Login
                  onLoginDone={this.onLoginDone.bind(this)}
                  onLogoutDone={this.onLogoutDone.bind(this)}
                  googleLoginPath={`${config.apiURL}/auth/login/google`}
                  loginPath={'/auth/login'}
                  logoutPath={'/auth/logout'}
                />
              </div>
            </div>
          )}
        </Router>
      </Root>
    )
  }
}

export default App
