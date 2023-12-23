import React, { Component } from 'react'
import * as R from 'ramda'
import { BrowserRouter as Router, Redirect, Route } from 'react-router-dom'
import { ErrorBoundary } from 'react-error-boundary'
import Login from './UserLogin.js'
import Menu from './Menu.js'
import Player from './Player.js'
import './App.css'
import SlideoutPanel from './SlideoutPanel.js'
import Settings from './Settings.js'
import Spinner from './Spinner.js'
import Admin from './Admin.js'

import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials.js'
import config from './config.js'

import 'typeface-lato'
import { library } from '@fortawesome/fontawesome-svg-core'
import { faChrome, faFacebook, faGithub, faTelegram, faTwitter, faYoutube } from '@fortawesome/free-brands-svg-icons'
import {
  faBackward,
  faBan,
  faBars,
  faBell,
  faBellSlash,
  faCaretDown,
  faCircle,
  faCircleQuestion,
  faClipboard,
  faClipboardCheck,
  faCopy,
  faExclamationCircle,
  faLightbulb,
  faExternalLinkAlt,
  faForward,
  faHeart,
  faHeartBroken,
  faInfoCircle,
  faKeyboard,
  faMinus,
  faMoneyBills,
  faPause,
  faPlay,
  faPlus,
  faSearch,
  faShare,
  faStar,
  faStepBackward,
  faStepForward,
  faTimesCircle
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Onboarding from './Onboarding'

library.add(
  faTwitter,
  faFacebook,
  faTelegram,
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
  faLightbulb,
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
  faCircleQuestion,
  faInfoCircle,
  faClipboard,
  faClipboardCheck,
  faCaretDown,
  faBell,
  faBellSlash,
  faSearch,
  faShare,
  faStar,
  faMoneyBills
)

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
      carts: [],
      stores: [],
      scoreWeights: {},
      notifications: [],
      loggedIn: false,
      loading: true,
      tracksData: defaultTracksData,
      initialPosition: NaN,
      processingCart: false,
      userSettings: {},
      isMobile: this.mobileCheck(),
      onboarding: false
    }
  }

  mobileCheck() {
    let check = false
    ;(function(a) {
      if (
        /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(
          a
        ) ||
        /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(
          a.substr(0, 4)
        )
      )
        check = true
    })(navigator.userAgent || navigator.vendor || window.opera)
    return check
  }

  async updateStatesFromServer() {
    await Promise.all([
      this.updateTracks(),
      this.updateCarts(),
      this.updateDefaultCart(),
      this.updateScoreWeights(),
      this.updateFollows(),
      this.updateNotifications(),
      this.updateSettings(),
      this.updateStores()
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

  async onFetchCart(cartId) {
    const cartDetails = await requestJSONwithCredentials({
      path: `/me/carts/${cartId}`
    })
    let updatedCarts = this.state.carts.slice()
    const cartIndex = updatedCarts.findIndex(({ id }) => id === cartId)
    updatedCarts[cartIndex] = cartDetails
    this.setState({ carts: updatedCarts })
  }

  async updateDefaultCart() {
    const defaultCart = await requestJSONwithCredentials({
      path: `/me/carts/default`
    })
    let updatedCarts = this.state.carts.slice()
    const defaultCartIndex = updatedCarts.findIndex(({ is_default }) => is_default)
    defaultCartIndex !== -1 ? (updatedCarts[defaultCartIndex] = defaultCart) : updatedCarts.push(defaultCart)
    this.setState({ carts: updatedCarts })
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
    await Promise.all([this.updateTracks()])
    await Promise.all([this.updateDefaultCart()])
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

  async requestNotificationUpdate(operations) {
    const notifications = await requestJSONwithCredentials({
      path: `/me/notifications`,
      method: 'PATCH',
      body: operations
    })

    this.setState({ notifications })
  }

  async setStarred(type, followId, starred) {
    await requestWithCredentials({
      path: `/me/follows/${type}/${followId}`,
      method: 'PUT',
      body: {
        starred
      }
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

    this.setState({
      tracksData: { tracks, meta: { newTracks, totalTracks } },
      onboarding: tracks.new.length === 0 && tracks.heard.length === 0
    })
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

  async createCart(cartName) {
    return await requestJSONwithCredentials({
      path: `/me/carts`,
      method: 'POST',
      body: { name: cartName }
    })
  }

  async updateSettings() {
    const userSettings = await requestJSONwithCredentials({
      path: `/me/settings`
    })
    this.setState({ userSettings })
  }

  async updateStores() {
    const stores = await requestJSONwithCredentials({
      path: `/stores/`
    })
    this.setState({ stores })
  }

  async updateLogins() {}

  onOnboardingButtonClicked() {
    this.setState({ onboarding: !this.state.onboarding })
  }

  openMenu() {
    debugger
    this.refs['slideout'].open()
  }

  toggleMenu() {
    this.refs['slideout'].toggle()
  }

  render() {
    return (
      <ErrorBoundary
        onError={(error, errorInfo) =>
          requestWithCredentials({ url: `/log/error`, method: 'POST', body: { error, errorInfo } })
        }
      >
        <Root>
          <Router>
            {this.state.loading ? (
              <div className="loading-overlay">
                🚀 Launching app
                <Spinner />
              </div>
            ) : this.state.loggedIn ? (
              <>
                <Onboarding
                  active={this.state.onboarding}
                  onOpenMenuRequested={(() => {
                    this.refs['slideout'].open()
                  }).bind(this)}
                  onOnboardingEnd={() => {
                    this.setState({ onboarding: false })
                  }}
                />
                <Menu
                  ref="menu"
                  logoutPath={`/auth/logout`}
                  loggedIn={this.state.loggedIn}
                  onNavButtonClicked={this.toggleMenu.bind(this)}
                  onLogoutDone={this.onLogoutDone.bind(this)}
                  onStoreLoginDone={() => {}} //this.onStoreLoginDone.bind(this)}
                  onUpdateTracks={this.updateTracks.bind(this)}
                />
                <SlideoutPanel ref="slideout" onOpen={this.updateLogins.bind(this)}>
                  <button
                    data-onboarding-id="slideout-button"
                    style={{ position: 'absolute', left: 0, margin: 10, color: 'white', zIndex: 11 }}
                    onClick={() => {
                      this.refs['slideout'].toggle()
                      if (Onboarding.active && Onboarding.isCurrentStep(Onboarding.steps.Menu)) {
                        Onboarding.helpers.next()
                      }
                    }}
                  >
                    <FontAwesomeIcon icon="bars" />
                  </button>
                  <Route exact path="/">
                    <Redirect to="/new" />
                  </Route>
                  <Route exact path="/admin">
                    <Admin />
                  </Route>
                  <Route
                    path="/:path"
                    render={props => {
                      const query = new URLSearchParams(props.location.search)
                      const settingsVisible = props.match.params.path === 'settings'
                      return (
                        <>
                          <Settings
                            carts={this.state.carts}
                            stores={this.state.stores}
                            onUpdateCarts={this.updateCarts.bind(this)}
                            notifications={this.state.notifications}
                            onRequestNotificationUpdate={this.requestNotificationUpdate.bind(this)}
                            onSetStarred={this.setStarred.bind(this)}
                            onMarkHeardClicked={this.markHeard.bind(this)}
                            onUpdateEmail={this.updateEmail.bind(this)}
                            onCreateCart={this.createCart.bind(this)}
                            newTracks={this.state.tracksData.meta.newTracks}
                            totalTracks={this.state.tracksData.meta.totalTracks}
                            userSettings={this.state.userSettings}
                            scoreWeights={this.state.scoreWeights}
                            tracks={this.state.tracksData.tracks}
                            follows={this.state.follows}
                            style={{ display: settingsVisible ? 'block' : 'none' }}
                          />
                          <Player
                            mode="app"
                            listState={settingsVisible ? 'new' : props.match.params.path}
                            search={query.get('q') || ''}
                            sort={query.get('sort') || ''}
                            initialPosition={NaN}
                            addingToCart={this.state.addingToCart}
                            onUpdateTracksClicked={this.updateTracks.bind(this)}
                            carts={this.state.carts}
                            notifications={this.state.notifications}
                            notificationsEnabled={this.state.userSettings.emailVerified}
                            onRequestNotificationUpdate={this.requestNotificationUpdate.bind(this)}
                            follows={this.state.follows}
                            tracks={this.state.tracksData.tracks}
                            stores={this.state.stores}
                            newTracks={this.state.tracksData.meta.newTracks}
                            totalTracks={this.state.tracksData.meta.totalTracks}
                            onAddToCart={this.addToCart.bind(this)}
                            onCreateCart={this.createCart.bind(this)}
                            onUpdateCarts={this.updateCarts.bind(this)}
                            onFetchCart={this.onFetchCart.bind(this)}
                            onRemoveFromCart={this.removeFromCart.bind(this)}
                            onMarkPurchased={this.onMarkPurchased.bind(this)}
                            onFollow={this.updateFollows.bind(this)}
                            onOnboardingButtonClicked={this.onOnboardingButtonClicked.bind(this)}
                            processingCart={this.state.processingCart}
                            isMobile={this.state.isMobile}
                            style={{ display: !settingsVisible ? 'block' : 'none' }}
                          />
                        </>
                      )
                    }}
                  />
                </SlideoutPanel>
              </>
            ) : this.state.list ? (
              <Player
                mode="list"
                carts={[this.state.list]}
                initialPosition={this.state.initialPosition}
                notifications={this.state.notifications}
                tracks={this.state.list.tracks}
              />
            ) : (
              <div className="align-center-container full-screen-popup-container">
                <div className="full-screen-popup">
                  <h1 style={{ marginTop: 0, textAlign: 'center' }}>Fomo Player</h1>
                  <Login
                    onLoginDone={this.onLoginDone.bind(this)}
                    onLogoutDone={this.onLogoutDone.bind(this)}
                    googleLoginPath={`${config.apiURL}/auth/login/google`}
                    logoutPath={'/auth/logout'}
                  />
                  {process.env.NODE_ENV !== 'production' && (
                    <p>
                      <form
                        onSubmit={e => {
                          e.preventDefault()
                          const formData = new FormData(e.target)
                          console.log(formData)
                          this.onLoginDone()
                        }}
                      >
                        <label>
                          Username
                          <input name="username" value={'testuser'} />
                        </label>
                        <br />
                        <label>
                          password
                          <input name="password" value={'testpwd'} />
                        </label>
                        <br />
                        <input type={'submit'} value={'Login'} data-test-id={'form-login-button'} />
                      </form>
                    </p>
                  )}
                  <div className="login-separator">or</div>
                  <a
                    href="https://github.com/gadgetmies/fomoplayer/wiki"
                    className={'button button-push_button-large button-push_button-primary'}
                    target="_blank"
                  >
                    Find out more on Github <FontAwesomeIcon icon={['fab', 'github']} />
                  </a>
                </div>
              </div>
            )}
          </Router>
        </Root>
      </ErrorBoundary>
    )
  }
}

export default App
