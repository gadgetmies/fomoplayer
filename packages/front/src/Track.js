import './Tracks.css'
import React, { Component } from 'react'
import * as R from 'ramda'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import PillButton from './PillButton'
import ShareLink from './ShareLink'
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
      processingCart: false,
      newCartName: ''
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

  async handleCreateCartClick(cartName) {
    try {
      const res = await this.props.onCreateCart(cartName)
      this.setState({ newCartName: '' })
      await this.props.onUpdateCarts()
      return res
    } catch (e) {
      console.error('Error while creating new cart', e)
    } finally {
      this.setState({ processingCart: false })
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
    const searchString = encodeURIComponent(
      `${this.props.artists.map(R.prop('name')).join('+')}+${this.props.title}+${this.props.version}`
    )

    const title = `${this.props.title} ${this.props.version ? `(${this.props.version})` : ''}`

    const artistsAndRemixers = R.uniq(this.props.artists.concat(this.props.remixers))
    const cartLink = new URL(`/cart/${this.props.cartUuid}`, window.location).toString()
    const cartName = this.props.selectedCart?.name
    const handleCartButtonClick = this.handleCartButtonClick.bind(this)
    const createCart = this.handleCreateCartClick.bind(this)
    const handleMarkPurchasedButtonClick = this.handlMarkPurchasedButtonClick.bind(this)
    const currentCartId = this.props.listState === 'cart' ? this.props.selectedCartId : this.props.defaultCartId
    const inCurrentCart = this.props.inCurrentCart
    const inDefaultCart = this.props.inDefaultCart
    const inCart = this.props.listState === 'cart' ? inCurrentCart : inDefaultCart
    const processingCart = this.props.processingCart || this.state.processingCart
    const [shareLabel, shareContent, shareLink] =
      this.props.listState === 'cart'
        ? [
            'Copy link to cart',
            `Listen to "${artistsAndRemixers
              .map(R.prop('name'))
              .join(', ')} - ${title}" in "${cartName}" on Fomo Player: ${`${cartLink}#${this.props.index + 1}`}`,
            'https://fomoplayer.com'
          ]
        : [
            'Copy links to clipboard',
            `Listen to "${artistsAndRemixers.map(R.prop('name')).join(', ')} - ${title}" on\n${this.props.stores
              .map(store => `${store.name}: ${store.url || store.release.url}`)
              .join('\n')}`,
            'https://fomoplayer.com'
          ]

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
            {this.props.listState === 'recent' && (
              <div className={`added-cell track-table-cell ${this.props.added ? '' : 'empty-cell'}`}>
                {this.props.added}
              </div>
            )}
            {this.props.listState !== 'recent' && (
              <div className={`released-cell track-table-cell ${this.props.released ? '' : 'empty-cell'}`}>
                {this.props.released}
              </div>
            )}
          </div>
          <div className={'track-details-right track-details-content'}>
            <div className={'bpm-cell track-table-cell'}>
              {this.props.bpms.length === 0 ? (
                '-'
              ) : (
                <ul className="comma-list">
                  {this.props.bpms.filter(R.identity).map(bpm => (
                    <li key={bpm}>{bpm}</li>
                  ))}
                </ul>
              )}
            </div>
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
          <td className={'follow-ignore-cart-cell tracks-cell'}>
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
                    style={{ zIndex: 100 }}
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
                  style={{ zIndex: 100 }}
                >
                  <div
                    className={'carts-list'}
                    onClick={e => e.stopPropagation()}
                    onDoubleClick={e => e.stopPropagation()}
                  >
                    <div className={'input-layout'}>
                      <input
                        placeholder={'New cart'}
                        style={{ flex: 1, width: '100%' }}
                        className={'text-input text-input-small text-input-dark'}
                        value={this.state.newCartName}
                        onChange={e => this.setState({ newCartName: e.target.value })}
                      />
                      <button
                        className="button button-push_button-small button-push_button-primary"
                        onClick={async () => {
                          const { id: cartId } = await createCart(this.state.newCartName)
                          await handleCartButtonClick(cartId, false)
                        }}
                      >
                        <FontAwesomeIcon icon="plus" />
                      </button>
                    </div>
                    <hr className={'popup-divider'} />
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
                  {!this.props.selectedCartIsPurchased && this.props.listState === 'cart' && (
                    <>
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
                    </>
                  )}
                </div>
              </span>
            </div>
          </td>
        ) : null}
        <td className={'open-share-cell tracks-cell'}>
          <div className={'open-cell track-table-cell'} style={{ overflow: 'visible', position: 'relative' }}>
            {R.intersperse(
              ' ',
              this.props.stores.map(store => (
                <a
                  onClick={e => {
                    e.stopPropagation()
                  }}
                  href={store.url || store.release.url}
                  title={`Open in ${store.name}`}
                  key={store.name}
                  className="pill pill-link table-cell-button"
                  target="_blank"
                >
                  <StoreIcon code={store.code} />
                  <span className={'pill-link-text'}>{store.name}</span>
                  <FontAwesomeIcon icon="external-link-alt" />
                </a>
              ))
            )}{' '}
            {beaportTrack ? null : (
              <>
                <a
                  onClick={e => e.stopPropagation()}
                  className="pill pill-link table-cell-button"
                  href={`https://www.beatport.com/search/tracks?q=${searchString}`}
                  title={'Search from Beatport'}
                  target="_blank"
                >
                  <StoreIcon code="beatport" />
                  <span className={'pill-link-text'}>Beatport</span>
                  <FontAwesomeIcon icon={'search'} />
                </a>{' '}
              </>
            )}
            {bandcampTrack ? null : (
              <>
                <a
                  onClick={e => e.stopPropagation()}
                  className="pill pill-link table-cell-button"
                  href={`https://bandcamp.com/search?q=${searchString}`}
                  title={'Search from Bandcamp'}
                  target="_blank"
                >
                  <StoreIcon code="bandcamp" />
                  <span className={'pill-link-text'}>Bandcamp</span>
                  <FontAwesomeIcon icon={'search'} />
                </a>{' '}
              </>
            )}
            {spotifyTrack ? null : (
              <>
                <a
                  onClick={e => e.stopPropagation()}
                  className="pill pill-link table-cell-button"
                  href={`https://open.spotify.com/search/${searchString}`}
                  title={'Search from Spotify'}
                  target="_blank"
                >
                  <StoreIcon code="spotify" />
                  <span className={'pill-link-text'}>Spotify</span>
                  <FontAwesomeIcon icon={'search'} />
                </a>{' '}
              </>
            )}
            <a
              className="pill pill-link table-cell-button"
              href={`https://www.youtube.com/results?search_query=${searchString}`}
              title={'Search from Youtube'}
              onClick={e => {
                e.stopPropagation()
              }}
              target={'_blank'}
            >
              <FontAwesomeIcon icon={['fab', 'youtube']} />
              <span className={'pill-link-text'}>Youtube</span>
              <FontAwesomeIcon icon={'search'} />
            </a>
            <div className={'share-button-container'}>
              <span className={'popup-anchor'}>
                <PillButton className={'table-cell-button'}>
                  <FontAwesomeIcon icon={'share'} /> <span className={'pill-button-text'}>Share</span>
                  <FontAwesomeIcon icon={'caret-down'} />
                </PillButton>
              </span>
              <div
                className={`popup-content${this.props.popupAbove ? ' popup-content__above' : ''} share-popup-content`}
                style={{ zIndex: 100 }}
              >
                <span
                  className="pill pill-button table-cell-button"
                  style={{ display: 'block', width: '100%', margin: 0, marginBottom: 4, padding: 0, border: 0 }}
                >
                  <span className="pill-button-contents">
                    <CopyToClipboardButton
                      title={shareLabel}
                      label={shareLabel}
                      content={shareContent}
                      style={{ height: '2rem', width: '100%' }}
                    />
                  </span>
                </span>
                <ShareLink
                  href={`https://telegram.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(
                    shareContent
                  )}`}
                  icon={<FontAwesomeIcon icon={['fab', 'telegram']} />}
                  label={'Share on Telegram'}
                />
                <ShareLink
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                    shareLink
                  )}&t=${encodeURIComponent(shareContent)}`}
                  icon={<FontAwesomeIcon icon={['fab', 'facebook']} />}
                  label={'Share on Facebook'}
                />
                <ShareLink
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(
                    shareLink
                  )}&text=${encodeURIComponent(shareContent)}`}
                  icon={<FontAwesomeIcon icon={['fab', 'twitter']} />}
                  label={'Share on Twitter'}
                />
              </div>
            </div>
          </div>
        </td>
      </tr>
    )
  }
}

export default Track
