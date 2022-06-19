import './Tracks.css'
import React, { Component } from 'react'
import * as R from 'ramda'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import PillButton from './PillButton'
import ExternalLink from './ExternalLink'
import StoreIcon from './StoreIcon'
import CopyToClipboardButton from './CopyToClipboardButton'
import scoreWeights from './scoreWeights'
import NavButton from './NavButton'

class Track extends Component {
  constructor(props) {
    super(props)
    this.state = {
      cartButtonDisabled: false,
      ignoreArtistsByLabelsDisabled: false,
      heardHover: false,
      heard: props.heard,
      processingCart: false
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
    return this.props.stores.find(R.propEq('code', code))
  }

  async handleCartButtonClick(cartId, inCart) {
    if (inCart) {
      this.setState({ processingCart: true })
      try {
        await this.props.onRemoveFromCart(cartId, this.props.id)
      } catch (e) {
        console.error('Error while removing from cart', e)
      } finally {
        this.setState({ processingCart: false })
      }
    } else {
      this.setState({ processingCart: true })
      try {
        await this.props.onAddToCart(cartId, this.props.id)
      } catch (e) {
        console.error('Error while adding to cart', e)
      } finally {
        this.setState({ processingCart: false })
      }
    }
  }

  async handlMarkPurchasedButtonClick() {
    this.setState({ processingCart: true })
    try {
      await this.props.onMarkPurchased(this.props.id)
    } finally {
      this.setState({ processingCart: false })
    }
  }

  render() {
    const spotifyTrack = this.getStoreTrackByStoreCode('spotify')
    const beaportTrack = this.getStoreTrackByStoreCode('beatport')
    const bandcampTrack = this.getStoreTrackByStoreCode('bandcamp')
    const searchString = `${this.props.artists.map(R.prop('name')).join('+')}+${this.props.title}`

    const title = `${this.props.title} ${this.props.version ? `(${this.props.version})` : ''}`

    const artistsAndRemixers = R.uniq(this.props.artists.concat(this.props.remixers))
    const cartLink = new URL(`/cart/${this.props.cartUuid}`, window.location).toString()
    const handleCartButtonClick = this.handleCartButtonClick.bind(this)
    const handleMarkPurchasedButtonClick = this.handlMarkPurchasedButtonClick.bind(this)
    const currentCartId = this.props.listState === 'cart' ? this.props.selectedCartId : this.props.defaultCartId
    const inCurrentCart = this.props.inCurrentCart
    const inDefaultCart = this.props.inDefaultCart
    const inCart = this.props.listState === 'cart' ? inCurrentCart : inDefaultCart
    const processingCart = this.props.processingCart || this.state.processingCart

    return (
      <tr
        ref={'row'}
        style={{ display: 'flex', width: '100%' }}
        onClick={() => this.props.onClick()}
        onDoubleClick={() => {
          this.props.onDoubleClick()
        }}
        className={`track ${this.props.selected ? 'selected' : ''} ${this.props.playing ? 'playing' : ''}`}
      >
        {this.props.mode === 'app' ? (
          <td className={'new-cell tracks-cell'}>
            <button
              className="button track-play-button"
              onClick={this.props.onDoubleClick.bind(this)}
              onMouseEnter={() => this.setHeardHover(true)}
              onMouseLeave={() => this.setHeardHover(false)}
            >
              {this.state.heardHover ? (
                <FontAwesomeIcon icon="play" />
              ) : !!this.props.heard ? null : (
                <FontAwesomeIcon icon="circle" />
              )}
            </button>
            {!!this.props.heard ? null : <div className={'track-new-indicator'} />}
          </td>
        ) : null}
        <td className={'track-details tracks-cell'}>
          <div className={'track-details-left track-details-content'}>
            <div className={'artist-cell track-table-cell'} title={artistsAndRemixers.map(R.prop('name'))}>
              {R.intersperse(
                ', ',
                artistsAndRemixers.map(artist => (
                  <span
                    className={this.props.follows?.artists.find(({ id }) => id === artist.id) ? 'following' : ''}
                    key={artist.name}
                  >
                    {artist.name}
                  </span>
                ))
              )}
            </div>
            <div className={'title-cell track-table-cell'} title={title}>
              {title}
            </div>
            <div
              className={`label-cell track-table-cell ${this.props.labels ? '' : 'empty-cell'}`}
              title={this.props.labels.map(R.prop('name'))}
            >
              {R.intersperse(
                ', ',
                this.props.labels.map(label => (
                  <span
                    className={this.props.follows?.labels.find(({ id }) => id === label.id) ? 'following' : ''}
                    key={label.name}
                  >
                    {label.name}
                  </span>
                ))
              )}
            </div>
          </div>
          <div className={'track-details-center track-details-content'}>
            <div className={`added-cell track-table-cell ${this.props.added ? '' : 'empty-cell'}`}>
              {this.props.added}
            </div>
            <div className={`released-cell track-table-cell ${this.props.released ? '' : 'empty-cell'}`}>
              {this.props.released}
            </div>
            <div className={`published-cell track-table-cell ${this.props.published ? '' : 'empty-cell'}`}>
              {this.props.published}
            </div>
          </div>
          <div className={'track-details-right track-details-content'}>
            <div className={'key-cell track-table-cell'}>
              {this.props.keys.length === 0 ? (
                '-'
              ) : (
                <ul className="comma-list">
                  {this.props.keys.filter(R.propEq('system', 'open-key')).map(({ key }) => (
                    <li key={key}>{key}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </td>
        {this.props.mode === 'app' ? (
          <td className={'follow-ignore-cart-cell tracks-cell'} style={{ overflow: 'visible' }}>
            {this.props.listState === 'new' && (
              <div className={'score-cell track-table-cell'} style={{ position: 'relative', overflow: 'visible' }}>
                <>
                  <span className={'popup-anchor'}>
                    <PillButton className={'table-cell-button'}>{Math.round(this.props.score)}</PillButton>
                  </span>
                  <div
                    className={`popup-content${
                      this.props.popupAbove ? ' popup-content__above' : ''
                    } score-popup-content`}
                    style={{ width: 250, zIndex: 100 }}
                  >
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
                        {Object.entries(this.props.scoreDetails).map(([key, value]) => (
                          <tr>
                            <td>{scoreWeights[key].label}</td>
                            <td>{value.score}</td>
                            <td>{value.weight}</td>
                            <td>{Math.round(value.score * value.weight * 100) / 100}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <hr className={'popup-divider'} />
                    <NavButton to={'/settings?page=sorting'}>Adjust weights</NavButton>
                  </div>
                </>
              </div>
            )}
            <div className="follow-cell track-table-cell">
              <PillButton
                className={'table-cell-button'}
                onClick={e => {
                  e.stopPropagation()
                  this.props.onFollowClicked()
                }}
              >
                <FontAwesomeIcon icon={'heart'} />
                <span className={'follow-button-label'} />
              </PillButton>
            </div>
            <div className="ignore-cell track-table-cell">
              <PillButton
                className={'table-cell-button'}
                onClick={e => {
                  e.stopPropagation()
                  this.props.onIgnoreClicked()
                }}
              >
                <FontAwesomeIcon icon={'ban'} />
                <span className={'ignore-button-label'} />
              </PillButton>
            </div>
            <div className={'cart-cell track-table-cell'} style={{ overflow: 'visible' }}>
              <span className={'table-cell-button-row'} style={{ position: 'relative' }}>
                <PillButton
                  disabled={processingCart}
                  className={'table-cell-button'}
                  onClick={e => {
                    e.stopPropagation()
                    return handleCartButtonClick(currentCartId, inCart)
                  }}
                >
                  <FontAwesomeIcon icon={inCart ? 'minus' : 'plus'} />{' '}
                  <span className={'cart-button-label'}>{inCart ? 'Remove from cart' : 'Add to cart'}</span>
                </PillButton>
                <span className={'popup-anchor'}>
                  <PillButton
                    className={'table-cell-button table-cell-button-row__last'}
                    style={{
                      backgroundColor: '#000',
                      color: 'black'
                    }}
                  >
                    <FontAwesomeIcon icon="caret-down" />
                  </PillButton>
                </span>
                <div
                  className={`popup-content${this.props.popupAbove ? ' popup-content__above' : ''} cart-popup-content`}
                  style={{ width: 100, zIndex: 100 }}
                >
                  <div className={'carts-list'}>
                    {this.props.carts.map(({ id, name }) => {
                      const isInCart = this.props.inCarts.find(R.propEq('id', id))
                      return (
                        <button
                          disabled={processingCart}
                          style={{
                            display: 'block',
                            width: '100%',
                            marginBottom: 4,
                            position: 'relative',
                            paddingLeft: '20px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            textAlign: 'left'
                          }}
                          className="button button-push_button-small button-push_button-primary"
                          onClick={e => {
                            e.stopPropagation()
                            return handleCartButtonClick(id, isInCart)
                          }}
                          key={`cart-${id}`}
                        >
                          <FontAwesomeIcon
                            icon={isInCart ? 'minus' : 'plus'}
                            style={{ position: 'absolute', left: 0, marginLeft: 6 }}
                          />{' '}
                          {name}
                        </button>
                      )
                    })}
                  </div>
                  <hr className={'popup-divider'} />
                  <button
                    disabled={processingCart}
                    style={{ display: 'block', width: '100%', marginBottom: 4, whiteSpace: 'normal' }}
                    className="button button-push_button-small button-push_button-primary"
                    onClick={e => {
                      e.stopPropagation()
                      return handleMarkPurchasedButtonClick()
                    }}
                  >
                    Mark purchased and remove from carts
                  </button>
                </div>
              </span>
            </div>
          </td>
        ) : null}
        <td className={'open-search-cell tracks-cell'}>
          <div className={'open-cell track-table-cell'}>
            {R.intersperse(
              ' ',
              this.props.stores.map(store => (
                <ExternalLink
                  showIcon={false}
                  href={store.url || store.release.url}
                  title={`Open in ${store.name}`}
                  className={'link link-icon'}
                  key={store.name}
                >
                  <StoreIcon code={store.code} />
                </ExternalLink>
              ))
            )}{' '}
            {this.props.listState === 'cart' ? (
              <CopyToClipboardButton content={`${cartLink}#${this.props.index + 1}`} />
            ) : (
              <CopyToClipboardButton
                content={`Listen to "${artistsAndRemixers.map(R.prop('name')).join(', ')} - ${title}" on
${this.props.stores.map(store => `${store.name}: ${store.url || store.release.url}`).join('\n')}`}
              />
            )}
          </div>
          <div className="search-cell track-table-cell">
            {beaportTrack ? null : (
              <>
                <ExternalLink
                  className="link link-icon"
                  showIcon={false}
                  href={`https://www.beatport.com/search/tracks?q=${searchString}`}
                >
                  <StoreIcon code="beatport" />
                </ExternalLink>{' '}
              </>
            )}
            {bandcampTrack ? null : (
              <>
                <ExternalLink
                  className="link link-icon"
                  showIcon={false}
                  href={`https://bandcamp.com/search?q=${searchString}`}
                >
                  <StoreIcon code="bandcamp" />
                </ExternalLink>{' '}
              </>
            )}
            {spotifyTrack ? null : (
              <>
                <ExternalLink
                  className="link link-icon"
                  showIcon={false}
                  href={`https://open.spotify.com/search/${searchString}`}
                >
                  <StoreIcon code="spotify" />
                </ExternalLink>{' '}
              </>
            )}
            <ExternalLink
              className="link link-icon"
              showIcon={false}
              href={`https://www.youtube.com/results?search_query=${searchString}`}
            >
              <FontAwesomeIcon icon={['fab', 'youtube']} />
            </ExternalLink>
          </div>
        </td>
      </tr>
    )
  }
}

export default Track
