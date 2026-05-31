import './Track.css'
import React, { Component } from 'react'
import * as R from 'ramda'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import PillButton from './PillButton'
import StoreIcon from './StoreIcon'
import scoreWeights from './scoreWeights'
import { followableNameLinks, namesToString } from './trackFunctions'
import { Link } from 'react-router-dom'
import Popup from './Popup'
import { CartDropDownButton } from './CartDropDownButton'

const isNumber = (value) => typeof value === 'number' && !Number.isNaN(value)

// Swipe-right-to-mark-heard gesture tuning (mobile / touch devices).
const SWIPE_HEARD_THRESHOLD = 90 // px the row must travel right before a release marks it heard
const SWIPE_HEARD_MAX = 140 // px the row is allowed to travel (resistance cap)
const SWIPE_DIRECTION_LOCK = 8 // px of movement before we commit to horizontal vs. vertical
const SWIPE_TAP_SLOP = 10 // px of horizontal travel beyond which a following click is suppressed

// Only offer the swipe gesture on touch / coarse-pointer devices. On a desktop
// with a mouse the dedicated "Mark heard" controls are visible instead, so the
// gesture would only get in the way.
const supportsTouchGestures = () => {
  if (typeof window === 'undefined') return false
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return true
  if (typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(pointer: coarse)').matches
    } catch (_e) {
      /* matchMedia can throw on malformed queries in old engines */
    }
  }
  return typeof window !== 'undefined' && 'ontouchstart' in window
}

class Track extends Component {
  constructor(props) {
    super(props)
    this.state = {
      cartButtonDisabled: false,
      ignoreArtistsByLabelsDisabled: false,
      heardHover: false,
      heard: props.heard,
      processingCart: false,
      newCartName: '',
      swipeOffset: 0,
      swiping: false,
    }
    this.swipeStartX = null
    this.swipeStartY = null
    this.swipeDirection = null
    this.swiped = false
    this.handleSwipeTouchStart = this.handleSwipeTouchStart.bind(this)
    this.handleSwipeTouchMove = this.handleSwipeTouchMove.bind(this)
    this.handleSwipeTouchEnd = this.handleSwipeTouchEnd.bind(this)
  }

  // The right-swipe toggles a track's heard state, so it is offered on the
  // listening lists (new / recent / heard) in app mode on touch devices.
  isSwipeToToggleHeardEnabled() {
    return (
      supportsTouchGestures() && this.props.mode === 'app' && ['new', 'recent', 'heard'].includes(this.props.listState)
    )
  }

  handleSwipeTouchStart(event) {
    if (!this.isSwipeToToggleHeardEnabled()) return
    const touch = event.touches[0]
    if (!touch) return
    this.swipeStartX = touch.clientX
    this.swipeStartY = touch.clientY
    this.swipeDirection = null
    this.swiped = false
    if (this.state.swipeOffset !== 0 || this.state.swiping) {
      this.setState({ swipeOffset: 0, swiping: false })
    }
  }

  handleSwipeTouchMove(event) {
    if (this.swipeStartX === null) return
    const touch = event.touches[0]
    if (!touch) return
    const deltaX = touch.clientX - this.swipeStartX
    const deltaY = touch.clientY - this.swipeStartY

    if (this.swipeDirection === null) {
      if (Math.abs(deltaX) < SWIPE_DIRECTION_LOCK && Math.abs(deltaY) < SWIPE_DIRECTION_LOCK) return
      // Lock to whichever axis dominates so vertical scrolling still works.
      this.swipeDirection = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
      if (this.swipeDirection === 'horizontal') {
        this.setState({ swiping: true })
      }
    }

    if (this.swipeDirection !== 'horizontal') return

    // Keep the row's pull-to-refresh / scroll handlers on the table body from
    // also reacting to this horizontal gesture.
    event.stopPropagation()

    const offset = Math.max(0, Math.min(SWIPE_HEARD_MAX, deltaX))
    if (offset > SWIPE_TAP_SLOP) this.swiped = true
    if (offset !== this.state.swipeOffset) {
      this.setState({ swipeOffset: offset })
    }
  }

  handleSwipeTouchEnd() {
    if (this.swipeStartX === null) return
    const triggered = this.swipeDirection === 'horizontal' && this.state.swipeOffset >= SWIPE_HEARD_THRESHOLD
    this.swipeStartX = null
    this.swipeStartY = null
    this.swipeDirection = null
    if (this.state.swipeOffset !== 0 || this.state.swiping) {
      this.setState({ swipeOffset: 0, swiping: false })
    }
    // Let the event keep bubbling so the table body's pull-to-refresh handler
    // can reset its own touch state; only the heard toggle is ours.
    if (triggered) {
      this.props.onToggleHeard(this.props.id, !this.props.heard)
    }
  }

  componentDidMount() {
    // TODO: this scrolls the preview player out of view
    // if (this.props.playing)
    // this.refs['row'].scrollIntoView()
  }

  componentDidUpdate(prevProps) {
    if (!R.equals(prevProps.inCart, this.props.inCart)) {
      this.setState({ cartButtonDisabled: false })
    }
  }

  setHeardHover(toState) {
    return this.setState({ heardHover: toState })
  }

  getStoreTrackByStoreCode(code) {
    return this.props.trackStores.find(R.propEq(code, 'code'))
  }

  render() {
    const searchString = encodeURIComponent(
      `${this.props.artists.map(R.prop('name')).join(' ')} ${this.props.title}${
        this.props.version ? ` ${this.props.version}` : ''
      }`,
    )
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')

    const title = `${this.props.title} ${this.props.version ? `(${this.props.version})` : ''}`
    const artistsAndRemixers = R.uniq(this.props.artists.concat(this.props.remixers))
    const trackId = this.props.id
    const currentCartId = this.props.listState === 'carts' ? this.props.selectedCartId : this.props.defaultCartId
    const inCurrentCart = this.props.inCurrentCart
    const inDefaultCart = this.props.inDefaultCart
    const inCart = this.props.listState === 'carts' ? inCurrentCart : inDefaultCart
    const processingCart = this.props.processingCart
    const processingTrack = this.props.processingTrack
    const removeLabel = this.props.listState === 'carts' ? 'Remove from current cart' : 'Remove from default cart'
    const noPreviews = this.props.noPreviews
    const scoreDetails = this.props.scoreDetails || {}

    const actions = this.props.stores
      ?.map(({ storeName, searchUrl }) => {
        if (
          this.props.mode === 'app' &&
          this.props.listState === 'carts' &&
          !this.props.enabledStores?.includes(storeName)
        )
          return null
        const trackStore = this.props.trackStores.find(R.propEq(storeName, 'name'))
        return trackStore
          ? (this.props.listState !== 'carts' ||
              this.props.mode !== 'app' ||
              this.props.enabledStores?.includes(storeName)) && (
              <a
                onClick={(e) => {
                  e.stopPropagation()
                }}
                href={trackStore.url || trackStore.release.url}
                title={`Open in ${trackStore.name}`}
                key={trackStore.name}
                className="pill pill-link pill-link-collapse table-cell-button"
                target="_blank"
                rel="noopener noreferrer"
              >
                <StoreIcon code={trackStore.code} />
                <span className={'pill-link-text'}>{trackStore.name}</span>
                <FontAwesomeIcon icon="external-link-alt" />
              </a>
            )
          : (this.props.listState !== 'carts' || this.props.enabledStoreSearch?.includes(storeName)) && (
              <a
                onClick={(e) => e.stopPropagation()}
                className="pill pill-link pill-link-collapse table-cell-button"
                href={`${searchUrl}${searchString}`}
                title={`Search from ${storeName}`}
                target="_blank"
                rel="noopener noreferrer"
                key={storeName}
              >
                <StoreIcon code={storeName.toLowerCase()} />
                <span className={'pill-link-text'}>{storeName}</span>
                <FontAwesomeIcon icon={'search'} />
              </a>
            )
      })
      ?.filter((i) => i)

    const cartFilter = this.props.cartFilter

    const noPreviewsTexts = (
      <>
        <p>There are no previews available for this track.</p>
        <p>You can open the track or search for it using the store links on the right.</p>
      </>
    )
    const [_, heardDate, heardTime] = !this.props.heard
      ? []
      : new Date(Date.parse(this.props.heard)).toISOString().match(/(.*)T(.*):/)
    const swipeEnabled = this.isSwipeToToggleHeardEnabled()
    const { swipeOffset, swiping } = this.state
    const swipePastThreshold = swipeOffset >= SWIPE_HEARD_THRESHOLD
    const swipeMarksUnheard = !!this.props.heard
    const swipeActionVerb = swipeMarksUnheard ? 'unheard' : 'heard'
    // Fixed two-line label: "Mark / heard" below the threshold, "Release to /
    // mark heard" above it (and the unheard equivalents).
    const swipeLine1 = swipePastThreshold ? 'Release to' : 'Mark'
    const swipeLine2 = swipePastThreshold ? `mark ${swipeActionVerb}` : swipeActionVerb
    // While swiping we follow the finger (no transition); on release we animate
    // the row sliding back. The reveal panel below animates in lock-step so the
    // strip it fills always tracks the row's slide (no off-colour gap appears).
    const swipeTransition = swiping ? 'none' : 'transform 200ms ease, width 200ms ease'
    return (
      <tr
        ref={'row'}
        style={{
          display: 'flex',
          width: '100%',
          position: 'relative',
          transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
          transition: swiping ? 'none' : 'transform 200ms ease',
        }}
        onClick={() => {
          // A swipe ends with the same tap target as a click; don't also play.
          if (this.swiped) {
            this.swiped = false
            return
          }
          this.props.onClick()
        }}
        onDoubleClick={() => {
          this.props.onDoubleClick()
        }}
        onTouchStart={swipeEnabled ? this.handleSwipeTouchStart : undefined}
        onTouchMove={swipeEnabled ? this.handleSwipeTouchMove : undefined}
        onTouchEnd={swipeEnabled ? this.handleSwipeTouchEnd : undefined}
        onTouchCancel={swipeEnabled ? this.handleSwipeTouchEnd : undefined}
        className={`track ${this.props.selected ? 'selected' : ''} ${this.props.playing ? 'playing' : ''} ${noPreviews ? 'track__no-previews' : ''}`}
      >
        {swipeEnabled && (
          <td
            className="swipe-heard-reveal"
            aria-hidden="true"
            style={{ width: swipeOffset, transform: `translateX(${-swipeOffset}px)`, transition: swipeTransition }}
          >
            <div
              className={
                `swipe-heard-indicator ` +
                `${swipeMarksUnheard ? 'swipe-heard-indicator__unheard' : ''} ` +
                `${swipePastThreshold ? 'swipe-heard-indicator__armed' : ''}`
              }
            >
              <span className="swipe-heard-indicator-line">{swipeLine1}</span>
              <span className="swipe-heard-indicator-line">{swipeLine2}</span>
            </div>
          </td>
        )}
        {this.props.mode === 'app' ? (
          <td className={'new-cell tracks-cell'}>
            <button
              className="button track-mark-heard-button"
              onClick={(e) => {
                this.props.onMarkHeardButtonClick(this.props.id)
                e.stopPropagation()
              }}
              onMouseEnter={() => this.setHeardHover(true)}
              onMouseLeave={() => this.setHeardHover(false)}
            >
              {this.props.noPreviews ? (
                <Popup
                  anchor={
                    this.state.heardHover && !this.props.heard ? (
                      <FontAwesomeIcon icon="times-circle" />
                    ) : (
                      <FontAwesomeIcon icon="circle-exclamation" />
                    )
                  }
                  popupAbove={this.props.popupAbove}
                  popupClassName={'popup_content-right'}
                >
                  <div
                    style={{
                      padding: 8,
                      minWidth: 200,
                      boxSizing: 'border-box',
                      lineHeight: 'normal',
                      textAlign: 'left',
                    }}
                  >
                    {noPreviewsTexts}
                    {!this.props.heard && (
                      <>
                        <p>Click the cross to mark the track heard.</p>
                      </>
                    )}
                  </div>
                </Popup>
              ) : this.state.heardHover ? (
                <FontAwesomeIcon icon="times-circle" />
              ) : !!this.props.heard ? null : (
                <FontAwesomeIcon icon="circle" />
              )}
            </button>
            {!!this.props.heard || swipeOffset > 0 ? null : <div className={'track-new-indicator'} />}
          </td>
        ) : null}
        <td className={'track-details tracks-cell'}>
          <div className={'track-details-left track-details-content'}>
            <div className={'artist-cell track-table-cell'} title={namesToString(artistsAndRemixers)}>
              {followableNameLinks(artistsAndRemixers, this.props.follows, 'artist', ', ', ' & ', this.props.onAddEntityToSearch)}
            </div>
            <div className={'title-cell track-table-cell'} title={title}>
              {title}
            </div>
            <div
              className={`label-cell track-table-cell ${this.props.labels ? '' : 'empty-cell'}`}
              title={namesToString(this.props.labels, ' / ')}
            >
              {followableNameLinks(this.props.labels, this.props.follows, 'label', ' / ', ' / ', this.props.onAddEntityToSearch)}
            </div>
          </div>
          <div className={'track-details-center track-details-content'}>
            {this.props.listState === 'recent' && (
              <div className={`added-cell track-table-cell ${this.props.added ? '' : 'empty-cell'}`}>
                {this.props.added}
              </div>
            )}
            {this.props.listState === 'heard' ? (
              <div className={`heard-cell track-table-cell ${this.props.heard ? '' : 'empty-cell'}`}>
                {heardDate} {heardTime}
              </div>
            ) : (
              this.props.listState !== 'recent' && (
                <div className={`released-cell track-table-cell ${this.props.released ? '' : 'empty-cell'}`}>
                  {this.props.released}
                </div>
              )
            )}
          </div>
          <div className={'track-details-right track-details-content'}>
            <div className={'genre-cell track-table-cell'}>
              {!this.props.genres?.length ? (
                '-'
              ) : (
                <ul className="comma-list">
                  {this.props.genres.map(({ name, id }) => (
                    <li key={id}>{name}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className={'bpm-cell track-table-cell'}>
              {this.props.bpms.length === 0 ? (
                '-'
              ) : (
                <ul className="comma-list">
                  {this.props.bpms.filter(R.identity).map((bpm) => (
                    <li key={bpm}>{Math.round(bpm)}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className={'key-cell track-table-cell'}>
              {this.props.keys.length === 0 ? (
                '-'
              ) : (
                <ul className="comma-list">
                  {this.props.keys.filter(R.propEq('open-key', 'system')).map(({ key }) => (
                    <li key={key}>{key}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </td>
        {this.props.mode === 'app' ? (
          <td className={'follow-ignore-cart-cell tracks-cell'}>
            <div
              className={`${this.props.similarity !== undefined ? 'similarity-cell' : 'score-cell'} track-table-cell`}
              style={{ overflow: 'visible', paddingRight: 5, paddingBottom: 0 }}
            >
              {this.props.similarity !== undefined && (
                <PillButton
                  className={'table-cell-button'}
                  style={{ display: 'flex', paddingBottom: 7, justifyContent: 'center' }}
                >
                  {isNumber(this.props.similarity) ? Math.round(this.props.similarity) : '-'}
                </PillButton>
              )}
              {this.props.listState === 'new' && (
                <Popup
                  anchor={
                    <PillButton
                      className={'table-cell-button'}
                      style={{ display: 'flex', paddingBottom: 7, justifyContent: 'center' }}
                    >
                      {scoreDetails.artists_starred || scoreDetails.label_starred
                        ? '★'
                        : isNumber(this.props.score)
                          ? Math.round(this.props.score)
                          : '-'}
                    </PillButton>
                  }
                  popupClassName={`score-popup_content`}
                  popupAbove={this.props.popupAbove}
                >
                  <div style={{ padding: 8, paddingBottom: 0, width: '100%', boxSizing: 'border-box' }}>
                    <table className={'score-table'}>
                      <thead>
                        <tr>
                          <th>Property</th>
                          <th>Value</th>
                          <th>Weight</th>
                          <th>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(
                          R.omit(['artists_starred', 'label_starred'], scoreDetails) || {},
                        ).map(([key, value]) => (
                          <tr key={key}>
                            <td>{scoreWeights[key]?.label}</td>
                            <td>{value.score}</td>
                            <td>{value.weight}</td>
                            <td>{Math.round(value.score * value.weight * 100) / 100}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <hr className={'popup-divider'} />
                    <Link to={'/settings/sorting'} style={{ width: '100%', display: 'block', textAlign: 'center' }}>
                      Adjust weights in settings
                    </Link>
                  </div>
                </Popup>
              )}
            </div>
            {noPreviews && (
              <div className={'cart-cell track-table-cell preview-missing-actions'} style={{ overflow: 'visible' }}>
                <Popup
                  popupAbove={this.props.popupAbove}
                  anchor={
                    <PillButton>
                      <FontAwesomeIcon icon={'exclamation-circle'} />
                      No previews
                    </PillButton>
                  }
                >
                  <div
                    style={{
                      padding: '8px 8px 32px 8px',
                      boxSizing: 'border-box',
                      lineHeight: 'normal',
                      minWidth: 200,
                    }}
                  >
                    {noPreviewsTexts}{' '}
                    {!this.props.heard && this.props.listState === 'new' && (
                      <p>Click the Mark heard button to remove the track from the list.</p>
                    )}
                  </div>
                </Popup>
              </div>
            )}
            <div
              className={'cart-cell track-table-cell'}
              style={{ overflow: 'visible', display: 'flex', alignItems: 'center' }}
            >
              <span className={'table-cell-button-row'} style={{ width: '100%' }}>
                <CartDropDownButton
                  {...{
                    processingTrack: processingTrack === trackId,
                    processingCart,
                    inCart,
                    removeLabel,
                    trackId,
                    currentCartId,
                    cartFilter,
                  }}
                  carts={this.props.carts}
                  inCarts={this.props.inCarts}
                  selectedCartIsPurchased={this.props.selectedCartIsPurchased}
                  buttonClassName="table-cell-button"
                  popupAbove={this.props.popupAbove}
                  onCartFilterChange={this.props.onCartFilterChange}
                  onClearCartFilter={this.props.onClearCartFilter}
                  onCartButtonClick={this.props.onCartButtonClick}
                  onMarkPurchasedButtonClick={this.props.onMarkPurchasedButtonClick}
                  onCreateCartClick={this.props.onCreateCartClick}
                />
              </span>
            </div>
            <div
              className={'cart-cell track-table-cell preview-missing-actions track-mark-heard-action'}
              style={{ overflow: 'visible' }}
            >
              <button
                disabled={this.props.heard}
                className={'button button-push_button button-push_button-small button-push_button-primary'}
                onClick={(e) => {
                  this.props.onMarkHeardButtonClick(this.props.id)
                  e.stopPropagation()
                }}
              >
                Mark as heard
              </button>
            </div>
          </td>
        ) : null}
        <td className={'open-share-cell tracks-cell'}>
          <div className={'open-cell track-table-cell'} style={{ overflow: 'visible' }}>
            {R.intersperse(' ', actions || [])}{' '}
            {(this.props.listState !== 'carts' ||
              this.props.mode !== 'app' ||
              this.props.enabledStoreSearch?.includes('Youtube')) &&
              this.props.stores.length !== 1 && (
                <a
                  className="pill pill-link pill-link-collapse table-cell-button"
                  href={`https://www.youtube.com/results?search_query=${searchString}`}
                  title={'Search from Youtube'}
                  onClick={(e) => {
                    e.stopPropagation()
                  }}
                  target={'_blank'}
                >
                  <FontAwesomeIcon icon={['fab', 'youtube']} />
                  <span className={'pill-link-text'}>Youtube</span>
                  <FontAwesomeIcon icon={'search'} />
                </a>
              )}
          </div>
        </td>
      </tr>
    )
  }
}

export default Track
