import DropDownButton from './DropDownButton'
import SearchBar from './SearchBar'
import * as R from 'ramda'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { NavLink } from 'react-router-dom'
import React, { useState } from 'react'

export const CartDropDownButton = ({
  processingTrack,
  processingCart,
  inCart,
  removeLabel,
  trackId,
  carts,
  currentCartId,
  cartFilter,
  inCarts,
  buttonClassName,
  popupClassName,
  onCartFilterChange,
  onClearCartFilter,
  onCartButtonClick,
  onCreateCartClick,
  selectedCartIsPurchased,
  onMarkPurchasedButtonClick,
}) => {
  const [newCartName, setNewCartName] = useState('')
  return (
    <DropDownButton
      icon={inCart ? 'minus' : 'cart-plus'}
      title={inCart ? removeLabel : 'Add to default cart'}
      buttonClassName={buttonClassName || ''}
      popupClassName={`cart-popup popup_content-small ${popupClassName || ''}`}
      buttonStyle={{ opacity: 1 }}
      popupStyle={{ overflow: 'hidden' }}
      loading={processingTrack}
      disabled={processingCart}
      onClick={(e) => {
        e.stopPropagation()
        return onCartButtonClick(trackId, currentCartId, inCart)
      }}
    >
      <div>
        <SearchBar
          placeholder={'Search'}
          styles={'large dark'}
          value={cartFilter}
          onChange={onCartFilterChange}
          onClearSearch={onClearCartFilter}
        />
      </div>
      <div
        className={'carts-list'}
        style={{ flex: 1 }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {carts.length === 0
          ? 'Loading carts...'
          : carts
              .filter(({ name }) => !cartFilter || name.toLocaleLowerCase().includes(cartFilter.toLowerCase()))
              .map(({ id: cartId, name }) => {
                const isInCart = inCarts.find(R.propEq('id', cartId))
                return (
                  <button
                    disabled={processingCart}
                    className="button button-push_button button-push_button-small button-push_button-primary cart-button"
                    onClick={(e) => {
                      e.stopPropagation()
                      return onCartButtonClick(trackId, cartId, isInCart)
                    }}
                    key={`cart-${cartId}`}
                  >
                    <FontAwesomeIcon icon={isInCart ? 'minus' : 'plus'} style={{ marginRight: 6 }} /> {name}
                  </button>
                )
              })}
      </div>
      <div style={{ paddingBottom: 24 }}>
        <hr className={'popup-divider'} />
        <div className={'input-layout'}>
          <input
            placeholder={'New cart'}
            style={{ flex: 1 }}
            className={'cart-popup-input text-input text-input-large text-input-dark'}
            value={newCartName}
            onChange={(e) => setNewCartName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="button button-push_button button-push_button-small button-push_button-primary"
            onClick={async (e) => {
              e.stopPropagation()
              setNewCartName('')
              const { id: cartId } = await onCreateCartClick(newCartName)
              await onCartButtonClick(trackId, cartId, false)
            }}
            disabled={newCartName === ''}
          >
            <FontAwesomeIcon icon="plus" />
          </button>
        </div>
        <hr className={'popup-divider'} />
        {!selectedCartIsPurchased && (
          <button
            disabled={processingCart}
            style={{ display: 'block', width: '100%', marginBottom: 4, whiteSpace: 'normal' }}
            className="button button-push_button button-push_button-small button-push_button-primary"
            onClick={(e) => {
              e.stopPropagation()
              return onMarkPurchasedButtonClick(trackId)
            }}
          >
            Mark purchased and remove from carts
          </button>
        )}
        <div style={{ textAlign: 'center', width: '100%' }}>
          <NavLink to={'/settings/carts'} style={{ textAlign: 'center' }}>
            Manage carts in settings
          </NavLink>
        </div>
      </div>
    </DropDownButton>
  )
}
