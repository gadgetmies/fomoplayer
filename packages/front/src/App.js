import React, { Component } from 'react'
import * as R from 'ramda'
import { BrowserRouter as Router, Link, Redirect, Route, useHistory } from 'react-router-dom'
import { ErrorBoundary } from 'react-error-boundary'
import Login from './UserLogin.js'
import Player from './Player.js'
import './App.css'
import Settings from './Settings.js'
import Spinner from './Spinner.js'
import Admin from './Admin.js'

import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials.js'
import config from './config.js'

import 'typeface-lato'
import { library } from '@fortawesome/fontawesome-svg-core'
import { fas } from '@fortawesome/free-solid-svg-icons'
import { far } from '@fortawesome/free-regular-svg-icons'
import { fab } from '@fortawesome/free-brands-svg-icons'
library.add(fas, far, fab)

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Onboarding from './Onboarding'
import TopBar from './TopBar'
import { trackArtistsAndTitleText } from './trackFunctions'
import FollowPopup from './FollowPopup'
import IgnorePopup from './IgnorePopup'
import KeyboardShortcutsPopup from './KeyboardShortcutsPopup'

// import injectTapEventPlugin from 'react-tap-event-plugin';
// injectTapEventPlugin();

const logoutPath = '/auth/logout'
const defaultTracksData = { tracks: { new: [], heard: [], recentlyAdded: [] }, meta: { totalTracks: 0, newTracks: 0 } }

const Root = (props) => <div className="root" style={{ height: '100vh' }} {...props} />
class App extends Component {
  constructor(props) {
    super(props)
    this.state = {
      addingToCart: false,
      carts: [],
      stores: [],
      scoreWeights: {},
      notifications: [],
      loggedIn: false,
      loading: true,
      tracksData: defaultTracksData,
      initialPosition: undefined,
      processingCart: false,
      userSettings: {},
      isMobile: this.mobileCheck(),
      onboarding: false,
      search: '',
      searchInProgress: false,
      searchError: undefined,
      searchResults: [],
      listState: 'new',
      heardTracks: defaultTracksData.tracks.heard,
      selectedCartUuid: undefined,
      selectedCart: undefined,
      mode: undefined,
    }
  }

  setListState(listState) {
    this.setState({ listState })
    window.history.replaceState(undefined, undefined, `/${listState}`)
  }

  mobileCheck() {
    let check = false
    ;(function (a) {
      if (
        /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(
          a,
        ) ||
        /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(
          a.substr(0, 4),
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
    ])
  }

  async componentDidMount() {
    const pathParts = location.pathname.slice(1).split('/')
    const isCartPath = pathParts[0] === 'carts'
    let sharedStates
    let cartSelectPromise = Promise.resolve()

    const storeFetchPromise = requestJSONwithCredentials({
      path: `/stores`,
    })

    if (isCartPath && pathParts.length > 1 && pathParts[1] !== '') {
      const cartUuid = pathParts[1]
      const filter = location.search
      cartSelectPromise = this.selectCart(cartUuid, filter)

      const initialPosition = parseInt(location.hash.substring(1)) || undefined
      sharedStates = { initialPosition }
    }

    try {
      const [stores] = await Promise.all([storeFetchPromise, cartSelectPromise, this.updateStatesFromServer()])
      this.setState({ loggedIn: true, mode: 'app', stores, ...sharedStates })
    } catch (e) {
      if (e.response?.status === 401 && isCartPath) {
        const stores = await storeFetchPromise
        this.setState({ mode: 'list', stores, ...sharedStates })
      } else {
        console.error(e)
      }
      this.setState({
        loggedIn: false,
      })
    } finally {
      this.setState({ loading: false })
    }
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
      path: `/me/carts`,
    })

    this.setState({
      carts: carts.filter(({ deleted }) => !deleted),
      selectedCartUuid: this.state.selectedCartUuid || carts[0].uuid,
      selectedCart: this.state.carts.find(({ uuid }) => uuid === this.state.selectedCartUuid),
    })
  }

  async updateDefaultCart() {
    const defaultCart = await requestJSONwithCredentials({
      path: `/me/carts/default`,
    })
    let updatedCarts = this.state.carts.slice()
    const defaultCartIndex = updatedCarts.findIndex(({ is_default }) => is_default)
    defaultCartIndex !== -1 ? (updatedCarts[defaultCartIndex] = defaultCart) : updatedCarts.push(defaultCart)
    this.setState({ carts: updatedCarts })
  }

  async updateScoreWeights() {
    const scoreWeights = await requestJSONwithCredentials({
      path: '/me/score-weights',
    })
    this.setState({ scoreWeights })
  }

  async addToCart(cartId, trackId) {
    this.setState({ addingToCart: true })
    const cartDetails = await requestJSONwithCredentials({
      path: `/me/carts/${cartId}/tracks`,
      method: 'PATCH',
      body: [{ op: 'add', trackId }],
    })

    this.updateCart(cartDetails)
    this.setState({ addingToCart: false })
  }

  async removeFromCart(cartId, trackId) {
    const cartDetails = await requestJSONwithCredentials({
      path: `/me/carts/${cartId}/tracks`,
      method: 'PATCH',
      body: [{ op: 'remove', trackId }],
    })

    this.updateCart(cartDetails)
  }

  async onMarkPurchased(trackId) {
    this.setState({ processingCart: true })
    await requestWithCredentials({
      path: `/me/carts/`,
      method: 'PATCH',
      body: [{ op: 'remove', trackId }],
    })
    await requestJSONwithCredentials({
      path: `/me/purchased/`,
      method: 'POST',
      body: [{ trackId }],
    })
    await Promise.all([this.updateTracks(), this.updateDefaultCart(), this.selectCart(this.state.selectedCartUuid)])
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
        path: `/me/follows/artists`,
      }),
      await requestJSONwithCredentials({
        path: `/me/follows/labels`,
      }),
    ])
    this.setState({ follows: { artists, labels } })
  }

  async requestNotificationUpdate(operations) {
    const notifications = await requestJSONwithCredentials({
      path: `/me/notifications`,
      method: 'PATCH',
      body: operations,
    })

    this.setState({ notifications })
  }

  async setStarred(type, followId, starred) {
    await requestWithCredentials({
      path: `/me/follows/${type}/${followId}`,
      method: 'PUT',
      body: {
        starred,
      },
    })

    await this.updateNotifications()
  }

  async updateNotifications() {
    this.setState({ notifications: await requestJSONwithCredentials({ path: '/me/notifications' }) })
  }

  async updateTracks() {
    const {
      meta: { new: newTracks, total: totalTracks },
      tracks,
    } = await requestJSONwithCredentials({
      path: `/me/tracks`,
    })

    this.setState({
      tracksData: { tracks, meta: { newTracks, totalTracks } },
      heardTracks: tracks.heard, // TODO: is this correct? Previously this was not updated
      onboarding: tracks.new.length === 0 && tracks.heard.length === 0,
    })
  }

  async markHeard(track) {
    if (this.state.listState === 'heard' || this.state.mode === 'list') {
      return
    }

    // TODO: if the tracks are always updated, the list refreshes -> problem?
    // await this.updateTracks()

    let updatedHeardTracks = this.state.heardTracks
    const updatedTrack = R.assoc('heard', true, track)
    const playedTrackIndex = this.state.heardTracks.findIndex(R.propEq('id', track.id))
    if (playedTrackIndex !== -1) {
      updatedHeardTracks.splice(playedTrackIndex, 1)
    } else {
      // TODO: Probably safer to not store the count, but instead calculate it from the array length
      this.setState({ listenedTracks: this.state.listenedTracks + 1 })
    }

    updatedHeardTracks = R.prepend(updatedTrack, updatedHeardTracks)
    this.setState({ heardTracks: updatedHeardTracks })

    // TODO: do this in the background? Although this should not block the UI either
    await requestWithCredentials({
      path: `/me/tracks/${track.id}`,
      method: 'POST',
      body: { heard: true },
    })
  }

  async updateEmail(email) {
    await requestWithCredentials({
      path: `/me/settings`,
      method: 'POST',
      body: { email },
    })
    await this.updateSettings()
  }

  async createCart(cartName) {
    return await requestJSONwithCredentials({
      path: `/me/carts`,
      method: 'POST',
      body: { name: cartName },
    })
  }

  async updateSettings() {
    const userSettings = await requestJSONwithCredentials({
      path: `/me/settings`,
    })
    this.setState({ userSettings })
  }

  onOnboardingButtonClicked() {
    this.setState({
      onboarding: !this.state.onboarding,
    })
  }

  setFollowPopupOpen(open) {
    this.setState({ followPopupOpen: open })
  }

  openFollowPopup(track) {
    this.setState({ followPopupTrack: track })
    this.setFollowPopupOpen(true)
  }

  setIgnorePopupOpen(open) {
    this.setState({ ignorePopupOpen: open })
  }

  openIgnorePopup(track) {
    this.setState({ ignorePopupTrack: track })
    this.setIgnorePopupOpen(true)
  }

  closePopups() {
    this.setFollowPopupOpen(false)
    this.setIgnorePopupOpen(false)
    this.setKeyboardShortcutsPopupOpen(false)
  }

  openKeyboardShortcutsPopup() {
    this.setKeyboardShortcutsPopupOpen(true)
  }

  setKeyboardShortcutsPopupOpen(open) {
    this.setState({ keyboardShortcutsPopupOpen: open })
  }

  async handleCartButtonClick(trackId, cartId, inCart) {
    if (inCart) {
      this.setState({ processingCart: true })
      try {
        await this.removeFromCart(cartId, trackId)
      } catch (e) {
        console.error('Error while removing from cart', e)
      } finally {
        this.setState({ processingCart: false })
      }
    } else {
      this.setState({ processingCart: true })
      try {
        await this.addToCart(cartId, trackId)
      } catch (e) {
        console.error('Error while adding to cart', e)
      } finally {
        this.setState({ processingCart: false })
      }
    }
  }

  async handleCreateCartClick(cartName) {
    try {
      this.setState({ processingCart: true })
      const res = await this.createCart(cartName)
      this.setState({ newCartName: '' })
      await this.updateCarts()
      return res
    } catch (e) {
      console.error('Error while creating new cart', e)
    } finally {
      this.setState({ processingCart: false })
    }
  }

  async handleToggleNotificationClick(search, subscribe, storeNames = undefined) {
    let operations = []
    try {
      if (storeNames === undefined) {
        if (subscribe) {
          operations = operations.concat(
            this.state.stores.map(({ storeName }) => ({
              op: 'add',
              storeName,
              text: search,
            })),
          )
        } else {
          operations = operations.concat(
            this.state.stores.map(({ storeName }) => ({ op: 'remove', storeName, text: search })),
          )
        }
      } else {
        storeNames.forEach((storeName) => {
          operations.push({ op: subscribe ? 'add' : 'remove', storeName, text: search })
        })
      }

      await this.requestNotificationUpdate(operations)
    } finally {
      this.setState({ modifyingNotification: false })
    }
  }

  async search(search, sort = '-released') {
    if (search === '') return
    this.setState({ searchInProgress: true, searchError: undefined })
    try {
      const searchResults = await (
        await requestWithCredentials({ path: `/tracks?q=${search}&sort=${sort || ''}` })
      ).json()
      this.setState({ searchResults, searchError: undefined })
      return undefined
    } catch (e) {
      console.error('Search failed', e)
      this.setState({ searchError: 'Search failed, please try again.' })
    } finally {
      this.setState({ searchInProgress: false })
    }
  }

  setCartFilter = (cartFilter) => {
    this.setState({ cartFilter })
  }

  logout = async () => {
    try {
      await requestWithCredentials({ path: logoutPath, method: 'POST' })
    } catch (e) {
      console.error('Logout failed', e)
    }
    this.onLogoutDone()
  }

  async triggerSearch() {
    return this.setSearch(this.state.search, true)
  }

  setSearch(search, triggerSearch = false) {}

  // TODO: change to POST {ignore: true} /me/labels/?
  async ignoreArtistsByLabels(artistId, labelIds, ignore) {
    await requestWithCredentials({
      path: `/me/ignores/artists-on-labels`,
      method: ignore ? 'POST' : 'DELETE',
      body: { artistIds: [artistId], labelIds },
    })
  }

  async ignoreArtist(artistId) {
    await requestWithCredentials({
      path: `/me/ignores/artists`,
      method: 'POST',
      body: [artistId],
    })
  }

  async ignoreLabel(labelId) {
    await requestWithCredentials({
      path: `/me/ignores/labels`,
      method: 'POST',
      body: [labelId],
    })
  }

  async ignoreRelease(releaseId) {
    await requestWithCredentials({
      path: `/me/ignores/releases`,
      method: 'POST',
      body: [releaseId],
    })
  }

  async selectCart(selectedCartUuid, filter) {
    this.setState({ selectedCartUuid })
    const cartDetails = await requestJSONwithCredentials({
      path: `/carts/${selectedCartUuid}${filter ? filter : ''}`,
    })
    let updatedCarts = this.state.carts.slice()
    let cartIndex = updatedCarts.findIndex(({ uuid }) => uuid === selectedCartUuid)
    if (cartIndex === -1) {
      cartIndex = updatedCarts.length
      updatedCarts.push(cartDetails)
    } else {
      updatedCarts[cartIndex] = cartDetails
    }

    this.setState({
      carts: updatedCarts,
      selectedCart: updatedCarts[cartIndex],
    })
  }

  async setCurrentTrack(track) {
    this.setState({ currentTrack: track })
    document.title = `${trackArtistsAndTitleText(track)} - Fomo Player`
  }

  async followStoreArtist(storeArtistId, storeArtistUrl, name, follow) {
    await requestWithCredentials({
      path: `/me/follows/artists/${follow ? '' : storeArtistId}`,
      method: follow ? 'POST' : 'DELETE',
      body: follow ? [{ url: storeArtistUrl, name }] : undefined,
    })

    await this.updateFollows()
  }

  async followStoreLabel(storeLabelId, storeLabelUrl, name, follow) {
    await requestWithCredentials({
      path: `/me/follows/labels/${follow ? '' : storeLabelId}`,
      method: follow ? 'POST' : 'DELETE',
      body: follow ? [{ url: storeLabelUrl, name }] : undefined,
    })

    await this.updateFollows()
  }

  async refreshListAndClosePopups() {
    await this.updateTracks()
    this.closePopups()
  }

  render() {
    return (
      <ErrorBoundary
        onError={(error, errorInfo) =>
          requestWithCredentials({ url: `/log/error`, method: 'POST', body: { error, errorInfo } })
        }
      >
        <Root
          className={`${this.state.listState === 'search' ? 'search-expanded' : ''} ${
            this.state.isMobile ? 'mobile' : 'desktop'
          }`}
          style={{ overflow: 'hidden', width: '100vw', height: '100vh' }}
        >
          <Router>
            {this.state.loading ? (
              <div className="loading-overlay">
                🚀 Launching app
                <Spinner />
              </div>
            ) : !this.state.loggedIn ? (
              this.state.mode === 'list' ? (
                <Player
                  mode="list"
                  initialPosition={this.state.initialPosition}
                  onSetCurrentTrack={this.setCurrentTrack.bind(this)}
                  carts={this.state.carts}
                  selectedCart={this.state.selectedCart}
                  tracks={this.state.carts.find(({ uuid }) => uuid === this.state.selectedCartUuid)?.tracks || []}
                  heardTracks={this.state.heardTracks}
                  stores={this.state.stores}
                  currentTrack={this.state.currentTrack}
                  isMobile={this.state.isMobile}
                  markHeard={this.markHeard.bind(this)}
                />
              ) : (
                <div style={{ background: '#333', width: '100%', height: '100%' }}>
                  <div style={{ paddingTop: '3rem', maxWidth: '60ch', margin: 'auto' }}>
                    <h1 style={{ marginTop: 0, textAlign: 'center' }}>
                      Fomo Player
                      <br />
                      <div style={{ fontSize: '50%', fontWeight: 300 }}>
                        Never miss a <span style={{ textDecoration: 'line-through' }}>beat</span> release!
                      </div>
                    </h1>
                    <div style={{ padding: '2rem' }}>
                      <div style={{ textAlign: 'center' }}>
                        <Login
                          onLoginDone={this.onLoginDone.bind(this)}
                          onLogoutDone={this.onLogoutDone.bind(this)}
                          googleLoginPath={`${config.apiURL}/auth/login/google?state=${window.location.pathname}`}
                          logoutPath={logoutPath}
                        />
                      </div>
                      <br />
                      {process.env.NODE_ENV !== 'production' && (
                        <p style={{ margin: '2rem' }}>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault()
                              return this.onLoginDone()
                            }}
                          >
                            <label className="text-input">
                              Username
                              <input name="username" value={'testuser'} />
                            </label>
                            <br />
                            <label>
                              Password
                              <input name="password" value={'testpwd'} />
                            </label>
                            <br />
                            <input
                              type={'submit'}
                              value={'Login'}
                              data-test-id={'form-login-button'}
                              className="button button-push_button login-button button-push_button-large button-push_button-primary"
                            />
                          </form>
                        </p>
                      )}
                      <div className="login-separator">Want to know more?</div>
                      <p>
                        Fomo Player is a service for keeping up with new releases from your favorite artists and labels.
                        The service prioritises releases based on your preferences and keeps track of tracks you have
                        already listened to, thus improving the efficiency of your music discovery.
                      </p>
                      <p style={{ textAlign: 'center', marginTop: '2rem' }}>
                        <a
                          href="https://github.com/gadgetmies/fomoplayer/wiki"
                          className={'button button-push_button button-push_button-large button-push_button-primary'}
                          target="_blank"
                        >
                          Find out more on Github <FontAwesomeIcon icon={['fab', 'github']} />
                        </a>
                      </p>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <>
                <Onboarding
                  newUser={this.state.tracksData.meta.totalTracks === 0}
                  active={this.state.onboarding}
                  onOnboardingEnd={() => {
                    this.setState({ onboarding: false })
                  }}
                />
                {this.state.follows ? (
                  <FollowPopup
                    open={this.state.followPopupOpen}
                    track={this.state.followPopupTrack}
                    follows={this.state.follows}
                    onCloseClicked={this.closePopups.bind(this)}
                    onFollowStoreArtist={this.followStoreArtist.bind(this)}
                    onFollowStoreLabel={this.followStoreLabel.bind(this)}
                    onRefreshAndCloseClicked={this.refreshListAndClosePopups.bind(this)}
                  />
                ) : null}
                <IgnorePopup
                  open={this.state.ignorePopupOpen}
                  track={this.state.ignorePopupTrack}
                  onCloseClicked={this.closePopups.bind(this)}
                  onIgnoreArtistOnLabels={this.ignoreArtistsByLabels.bind(this)}
                  onIgnoreArtist={this.ignoreArtist.bind(this)}
                  onIgnoreLabel={this.ignoreLabel.bind(this)}
                  onIgnoreRelease={this.ignoreRelease.bind(this)}
                  onRefreshAndCloseClicked={this.refreshListAndClosePopups.bind(this)}
                />
                <KeyboardShortcutsPopup
                  open={this.state.keyboardShortcutsPopupOpen}
                  mode={this.state.mode}
                  onCloseClicked={this.closePopups.bind(this)}
                />
                <TopBar
                  modifyingNotification={this.state.modifyingNotification}
                  emailVerified={this.state.userSettings.emailVerified}
                  triggerSearch={this.triggerSearch.bind(this)}
                  searchInProgress={this.state.searchInProgress}
                  onSearch={this.search.bind(this)}
                  onLogoutClicked={this.logout.bind(this)}
                  handleToggleNotificationClick={this.handleToggleNotificationClick.bind(this)}
                  listState={this.state.listState}
                  notifications={this.state.notifications}
                  search={this.state.search}
                  userSettings={this.state.userSettings}
                  stores={this.state.stores}
                  carts={this.state.carts}
                  onKeyboardShortcutsClicked={this.openKeyboardShortcutsPopup.bind(this)}
                  onOnboardingButtonClicked={this.onOnboardingButtonClicked.bind(this)}
                />

                <Route exact path="/">
                  <Redirect to="/tracks/new" />
                </Route>
                <Route exact path="/tracks">
                  <Redirect to="/tracks/new" />
                </Route>
                <Route exact path="/admin">
                  <Admin />
                </Route>
                <Route exact path="/carts">
                  <Redirect to={`/carts/${this.state.carts[0].uuid}`} />
                </Route>
                <Route
                  path="/:path"
                  render={(props) => {
                    const pathParts = props.location.pathname.slice(1).split('/')
                    const query = new URLSearchParams(props.location.search).get('q')?.trim()
                    const idSearch = query?.match(/(artist|label|release):(\d?)/)
                    if (
                      props.location.pathname.match(/^\/search\/?/) &&
                      idSearch !== null &&
                      this.state.search !== query
                    ) {
                      this.search(query)
                      this.setState({ search: query })
                    }
                    const settingsVisible = props.location.pathname.match(/\/settings\/?/)
                    let listState = this.state.listState
                    // TODO: this always takes the path from the match, which does not work when the state is changed instead
                    // Perhaps a componentWillChange handling could work?
                    if (!pathParts.includes(listState)) {
                      if (props.location.pathname !== '/search') {
                        this.setState({ search: '' })
                      }
                      this.setState({
                        listState: props.match.params.path === 'tracks' ? pathParts[1] || 'new' : pathParts[0],
                      })
                      listState = props.match.params.path
                    }

                    if (listState === 'carts' && this.state.selectedCartUuid !== pathParts[1]) {
                      const selectedCart = this.state.carts?.find(({ uuid }) => uuid === pathParts[1])
                      this.setState({ selectedCartUuid: pathParts[1], selectedCart })
                    }

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
                          addingToCart={this.state.addingToCart}
                          carts={this.state.carts}
                          cartFilter={this.state.cartFilter}
                          currentTrack={this.state.currentTrack}
                          follows={this.state.follows}
                          heardTracks={this.state.heardTracks}
                          initialPosition={this.state.initialPosition}
                          isMobile={this.state.isMobile}
                          listState={settingsVisible ? 'new' : listState}
                          mode="app"
                          newTracks={this.state.tracksData.meta.newTracks}
                          processingCart={this.state.processingCart}
                          search={this.state.search || ''}
                          searchError={this.state.searchError}
                          searchInProgress={this.state.searchInProgress}
                          searchResults={this.state.searchResults}
                          selectedCart={this.state.selectedCart}
                          stores={this.state.stores}
                          totalTracks={this.state.tracksData.meta.totalTracks}
                          tracks={this.state.tracksData.tracks}
                          markHeard={this.markHeard.bind(this)}
                          onAddToCart={this.addToCart.bind(this)}
                          onClosePopups={this.closePopups.bind(this)}
                          onCreateCart={this.createCart.bind(this)}
                          onHandleCartButtonClick={this.handleCartButtonClick.bind(this)}
                          onHandleCreateCartClick={this.handleCreateCartClick.bind(this)}
                          onIgnoreArtist={this.ignoreArtist.bind(this)}
                          onIgnoreArtistsByLabels={this.ignoreArtistsByLabels.bind(this)}
                          onIgnoreLabel={this.ignoreLabel.bind(this)}
                          onIgnoreRelease={this.ignoreRelease.bind(this)}
                          onMarkPurchased={this.onMarkPurchased.bind(this)}
                          onOpenFollowPopup={this.openFollowPopup.bind(this)}
                          onOpenIgnorePopup={this.openIgnorePopup.bind(this)}
                          onRemoveFromCart={this.removeFromCart.bind(this)}
                          onRequestNotificationUpdate={this.requestNotificationUpdate.bind(this)}
                          onSelectCart={this.selectCart.bind(this)}
                          onSetCurrentTrack={this.setCurrentTrack.bind(this)}
                          onSetListState={this.setListState.bind(this)}
                          onUpdateCarts={this.updateCarts.bind(this)}
                          onUpdateTracksClicked={this.updateTracks.bind(this)}
                          onCartFilterChange={this.setCartFilter.bind(this)}
                          style={{ display: !settingsVisible ? 'block' : 'none' }}
                        />
                      </>
                    )
                  }}
                />
              </>
            )}
          </Router>
        </Root>
      </ErrorBoundary>
    )
  }
}

export default App
