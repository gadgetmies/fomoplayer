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
    const removeLabel = this.props.listState === 'carts' ? 'Remove from current cart' : 'Remove from default cart'
    const noPreviews = this.props.noPreviews

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
                onClick={(e) => {
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
                onClick={(e) => e.stopPropagation()}
                className="pill pill-link pill-link-collapse table-cell-button"
                href={`${searchUrl}${searchString}`}
                title={`Search from ${storeName}`}
                target="_blank"
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

    return (
      <tr
        ref={'row'}
        style={{ display: 'flex', width: '100%' }}
        onClick={() => this.props.onClick()}
        onDoubleClick={() => {
          this.props.onDoubleClick()
        }}
        className={`track ${this.props.selected ? 'selected' : ''} ${this.props.playing ? 'playing' : ''} ${noPreviews ? 'track__no-previews' : ''}`}
      >
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
                  popupClassName={'popup_content-right'}
                >
                  <div style={{ padding: 8, width: 100, boxSizing: 'border-box', lineHeight: 'normal' }}>
                    There are no previews available for this track.{' '}
                    {!this.props.heard && 'Click here to mark it as heard.'}
                  </div>
                </Popup>
              ) : this.state.heardHover ? (
                <FontAwesomeIcon icon="times-circle" />
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
            <div
              className={'score-cell track-table-cell'}
              style={{ overflow: 'visible', paddingRight: 5, paddingBottom: 0 }}
            >
              {this.props.listState === 'new' && (
                <Popup
                  anchor={
                    <PillButton
                      className={'table-cell-button'}
                      style={{ display: 'flex', paddingBottom: 7, justifyContent: 'center' }}
                    >
                      {isNumber(this.props.score) ? Math.round(this.props.score) : '-'}
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
                  anchor={
                    <PillButton>
                      <FontAwesomeIcon icon={'exclamation-circle'} />
                      No previews
                    </PillButton>
                  }
                >
                  <div style={{ padding: 8, width: 200, boxSizing: 'border-box', lineHeight: 'normal' }}>
                    There are no previews available for this track. Click below to mark it as heard.
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
                  popupClassName={this.props.popupAbove ? ' popup_content__above' : ''}
                  onCartFilterChange={this.props.onCartFilterChange}
                  onClearCartFilter={this.props.onClearCartFilter}
                  onCartButtonClick={this.props.onCartButtonClick}
                  onMarkPurchasedButtonClick={this.props.onMarkPurchasedButtonClick}
                />
              </span>
            </div>
            <div className={'cart-cell track-table-cell preview-missing-actions'} style={{ overflow: 'visible' }}>
              <button
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
              this.props.enabledStoreSearch?.includes('Youtube')) && (
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
