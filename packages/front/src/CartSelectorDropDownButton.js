import './CartSelectorDropDownButton.css'
import DropDownButton from './DropDownButton'
import SearchBar from './SearchBar'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { NavLink } from 'react-router-dom'
import React, { useState } from 'react'

const matchesFilter = (name, filter) => !filter || name.toLocaleLowerCase().includes(filter.toLowerCase())

export const CartSelectorDropDownButton = ({
  carts,
  selectedCartId,
  onSelectCart,
  onCreateCartClick,
  disabled,
  buttonClassName,
  popupClassName,
}) => {
  const [cartFilter, setCartFilter] = useState('')
  const [newCartName, setNewCartName] = useState('')
  const [open, setOpen] = useState(false)

  const selectedCart = selectedCartId ? carts.find(({ id }) => String(id) === String(selectedCartId)) : undefined
  const label = selectedCart ? selectedCart.name : 'Default cart'

  const selectCart = (cartId) => {
    onSelectCart(cartId)
    setOpen(false)
  }

  return (
    <DropDownButton
      label={label}
      buttonClassName={`cart-selector-toggle ${buttonClassName || ''}`}
      popupClassName={`cart-popup popup_content-small ${popupClassName || ''}`}
      buttonStyle={{ opacity: 1 }}
      popupStyle={{ overflow: 'hidden' }}
      disabled={disabled}
      open={open}
      openOnHover={false}
      onOpenChanged={setOpen}
      onClick={() => setOpen((wasOpen) => !wasOpen)}
    >
      <div>
        <SearchBar
          placeholder={'Search'}
          styles={'large dark'}
          value={cartFilter}
          onChange={(e) => setCartFilter(e.target.value)}
          onClearSearch={() => setCartFilter('')}
        />
      </div>
      <div
        className={'carts-list'}
        style={{ flex: 1 }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {matchesFilter('Default cart', cartFilter) && (
          <button
            className="button button-push_button button-push_button-small button-push_button-primary cart-button"
            onClick={(e) => {
              e.stopPropagation()
              selectCart('')
            }}
            key="cart-default"
          >
            <FontAwesomeIcon icon={selectedCartId ? ['far', 'circle'] : 'circle-check'} style={{ marginRight: 6 }} />{' '}
            Default cart
          </button>
        )}
        {carts
          .filter(({ is_default }) => !is_default)
          .filter(({ name }) => matchesFilter(name, cartFilter))
          .map(({ id: cartId, name }) => {
            const isSelected = String(cartId) === String(selectedCartId)
            return (
              <button
                className="button button-push_button button-push_button-small button-push_button-primary cart-button"
                onClick={(e) => {
                  e.stopPropagation()
                  selectCart(String(cartId))
                }}
                key={`cart-${cartId}`}
              >
                <FontAwesomeIcon icon={isSelected ? 'circle-check' : ['far', 'circle']} style={{ marginRight: 6 }} />{' '}
                {name}
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
              const created = await onCreateCartClick(newCartName)
              if (created && created.id != null) {
                selectCart(String(created.id))
              }
            }}
            disabled={newCartName === ''}
          >
            <FontAwesomeIcon icon="plus" />
          </button>
        </div>
        <hr className={'popup-divider'} />
        <div style={{ textAlign: 'center', width: '100%' }}>
          <NavLink to={'/settings/carts'} onClick={() => setOpen(false)} style={{ textAlign: 'center' }}>
            Manage carts in settings
          </NavLink>
        </div>
      </div>
    </DropDownButton>
  )
}
