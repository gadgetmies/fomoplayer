import './Track.css'
import React, { Component } from 'react'
import * as R from 'ramda'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import PillButton from './PillButton'
import StoreIcon from './StoreIcon'
import scoreWeights from './scoreWeights'
import { followableNameLinks, namesToString } from './trackFunctions'
import DropDownButton from './DropDownButton'
import { Link } from 'react-router-dom'

const isNumber = value => typeof value === 'number' && !Number.isNaN(value)

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
    return this.props.trackStores.find(R.propEq('code', code))
  }

  render() {
    const searchString = encodeURIComponent(
      `${this.props.artists.map(R.prop('name')).join(' ')} ${this.props.title}${
        this.props.version ? ` ${this.props.version}` : ''
      }`
    )
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')

    const title = `${this.props.title} ${this.props.version ? `(${this.props.version})` : ''}`

    const artistsAndRemixers = R.uniq(this.props.artists.concat(this.props.remixers))
    const currentCartId = this.props.listState === 'carts' ? this.props.selectedCartId : this.props.defaultCartId
    const inCurrentCart = this.props.inCurrentCart
    const inDefaultCart = this.props.inDefaultCart
    const inCart = this.props.listState === 'carts' ? inCurrentCart : inDefaultCart
    const processingCart = this.props.processingCart
    const removeLabel = this.props.listState === 'carts' ? 'Remove from current cart' : 'Remove from default cart'

    const actions = this.props.stores
      ?.map(({ storeName, searchUrl }) => {
        if (
          this.props.mode === 'app' &&
          this.props.listState === 'carts' &&
          !this.props.enabledStores?.includes(storeName)
        )
          return null
        const trackStore = this.props.trackStores.find(R.propEq('name', storeName))
        return trackStore
          ? (this.props.listState !== 'carts' ||
              this.props.mode !== 'app' ||
              this.props.enabledStores?.includes(storeName)) && (
              <a
                onClick={e => {
                  e.stopPropagation()
                }}
                href={trackStore.url || trackStore.release.url}
                title={`Open in ${trackStore.name}`}
                key={trackStore.name}
                className="pill pill-link pill-link-collapse table-cell-button"
                target="_blank"
              >
                <StoreIcon code={trackStore.code} />
                <span className={'pill-link-text'}>{trackStore.name}</span>
                <FontAwesomeIcon icon="external-link-alt" />
              </a>
            )
          : (this.props.listState !== 'carts' || this.props.enabledStoreSearch?.includes(storeName)) && (
              <a
                onClick={e => e.stopPropagation()}
                className="pill pill-link pill-link-collapse table-cell-button"
                href={`${searchUrl}${searchString}`}
                title={`Search from ${storeName}`}
                target="_blank"
              >
                <StoreIcon code={storeName.toLowerCase()} />
                <span className={'pill-link-text'}>{storeName}</span>
                <FontAwesomeIcon icon={'search'} />
              </a>
            )
      })
      ?.filter(i => i)

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
            <div className={'artist-cell track-table-cell'} title={namesToString(artistsAndRemixers)}>
              {followableNameLinks(artistsAndRemixers, this.props.follows, 'artist')}
            </div>
            <div className={'title-cell track-table-cell'} title={title}>
              {title}
            </div>
            <div
              className={`label-cell track-table-cell ${this.props.labels ? '' : 'empty-cell'}`}
              title={namesToString(this.props.labels)}
            >
              {followableNameLinks(this.props.labels, this.props.follows, 'label')}
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
              <div
                className={'score-cell track-table-cell popup_container'}
                style={{ overflow: 'visible', paddingRight: 5, paddingBottom: 0 }}
              >
                <span className={'popup-anchor'}>
                  <PillButton className={'table-cell-button'} style={{ display: 'flex', paddingBottom: 7 }}>
                    {isNumber(this.props.score) ? Math.round(this.props.score) : '-'}
                  </PillButton>
                </span>
                <div
                  className={`popup_content${this.props.popupAbove ? ' popup_content__above' : ''} score-popup_content`}
                  style={{ margin: -4 }}
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
                      {Object.entries(this.props.scoreDetails || {}).map(([key, value]) => (
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
                  <Link to={'/settings/sorting'}>Adjust weights in settings</Link>
                </div>
              </div>
            )}
            <div
              className={'cart-cell track-table-cell'}
              style={{ overflow: 'visible', display: 'flex', alignItems: 'center' }}
            >
              <span className={'table-cell-button-row'} style={{ width: '100%' }}>
                <DropDownButton
                  icon={processingCart ? null : inCart ? 'minus' : 'cart-plus'}
                  title={inCart ? removeLabel : 'Add to default cart'}
                  buttonClassName="table-cell-button"
                  popupClassName="popup_content-small"
                  buttonStyle={{ opacity: 1 }}
                  loading={processingCart}
                  onClick={e => {
                    e.stopPropagation()
                    return this.props.onCartButtonClick(this.props.id, currentCartId, inCart)
                  }}
                >
                  <div
                    className={'carts-list'}
                    onClick={e => e.stopPropagation()}
                    onDoubleClick={e => e.stopPropagation()}
                  >
                    {this.props.carts.length === 0
                      ? 'Loading carts...'
                      : this.props.carts.map(({ id: cartId, name }) => {
                          const isInCart = this.props.inCarts.find(R.propEq('id', cartId))
                          return (
                            <button
                              disabled={processingCart}
                              className="button button-push_button button-push_button-small button-push_button-primary cart-button"
                              onClick={e => {
                                e.stopPropagation()
                                return this.props.onCartButtonClick(this.props.id, cartId, isInCart)
                              }}
                              key={`cart-${cartId}`}
                            >
                              <FontAwesomeIcon icon={isInCart ? 'minus' : 'plus'} style={{ marginRight: 6 }} /> {name}
                            </button>
                          )
                        })}
                    <hr className={'popup-divider'} />
                    <div className={'input-layout'}>
                      <input
                        placeholder={'New cart'}
                        style={{ flex: 1, width: '100%' }}
                        className={'new-cart-input text-input text-input-small text-input-dark'}
                        value={this.state.newCartName}
                        onChange={e => this.setState({ newCartName: e.target.value })}
                      />
                      <button
                        className="button button-push_button button-push_button-small button-push_button-primary"
                        onClick={async () => {
                          const { id: cartId } = await this.props.onCreateCartClick(this.state.newCartName)
                          await this.props.onCartButtonClick(cartId, false)
                        }}
                        disabled={this.state.newCartName === ''}
                      >
                        <FontAwesomeIcon icon="plus" />
                      </button>
                    </div>
                    {!this.props.selectedCartIsPurchased && (
                      <>
                        <hr className={'popup-divider'} />
                        <button
                          disabled={processingCart}
                          style={{ display: 'block', width: '100%', marginBottom: 4, whiteSpace: 'normal' }}
                          className="button button-push_button button-push_button-small button-push_button-primary"
                          onClick={e => {
                            e.stopPropagation()
                            return this.props.onMarkPurchasedButtonClick()
                          }}
                        >
                          Mark purchased and remove from carts
                        </button>
                      </>
                    )}
                  </div>
                  {/*</div>*/}
                </DropDownButton>
              </span>
            </div>
          </td>
        ) : null}
        <td className={'open-share-cell tracks-cell'}>
          <div className={'open-cell track-table-cell'} style={{ overflow: 'visible' }}>
            {R.intersperse(' ', actions || [])}{' '}
            {(this.props.listState !== 'carts' ||
              this.props.mode !== 'app' ||
              this.props.enabledStoreSearch?.includes('Youtube')) && (
              <a
                className="pill pill-link pill-link-collapse table-cell-button"
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
            )}
          </div>
        </td>
      </tr>
    )
  }
}

export default Track
