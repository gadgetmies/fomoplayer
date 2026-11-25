import './CartReviewBar.css'
import React, { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import DropDownButton from './DropDownButton'
import DropDown from './DropDown'
import ToggleButton from './ToggleButton'
import {
  REVIEW_TABS,
  acceptedStoreCounts,
  acceptedUrlsToOpen,
  isReviewing,
  openAcceptedNotice,
  openInNewTabs,
} from './cartReview'

// The Review switch of the cart bar, for the cart's owner.
export const CartReviewSwitch = ({ cartReview, disabled, onChange }) => (
  <span className="cart-review-switch">
    <label htmlFor="cart-review-switch" className="noselect">
      Review
    </label>
    <ToggleButton
      id="cart-review-switch"
      controlled
      testId="cart-review-switch"
      checked={cartReview.enabled}
      disabled={disabled}
      onChange={onChange}
    />
  </span>
)

const TabRow = ({ name, label, options, selected, onSelect, disabled }) => (
  <div
    className="select-button select-button--container state-select-button--container noselect cart-review-tabs"
    role="radiogroup"
    aria-label={label}
  >
    {options.map(({ key, label: optionLabel, count }) => {
      const id = `${name}-${key}`
      return (
        <React.Fragment key={key}>
          <input
            type="radio"
            id={id}
            name={name}
            checked={selected === key}
            disabled={disabled}
            onChange={() => onSelect(key)}
          />
          <label className="select_button-button select_button-button__small cart-review-tab" htmlFor={id} data-testid={id}>
            {optionLabel} <small>{count ?? ''}</small>
          </label>
        </React.Fragment>
      )
    })}
  </div>
)

// The review controls of a cart under review: the review-state tabs, the store tabs, Open accepted and Modify rejected.
const CartReviewBar = ({ cartReview, carts, stores, disabled, onSetFilter, onSetStoreFocus, onModifyRejected, onShowNotice }) => {
  const [excludedStores, setExcludedStores] = useState([])
  const [modifyOpen, setModifyOpen] = useState(false)
  const [newCartName, setNewCartName] = useState('')
  const [modifying, setModifying] = useState(false)
  if (!isReviewing(cartReview)) return null

  const counts = cartReview.counts || {}
  const appStores = (stores || []).map(({ storeName }) => storeName)
  const storeCounts = (cartReview.storeCounts || []).filter(({ store }) => appStores.includes(store))
  const storeTabs = [
    { key: 'all', label: 'All', count: storeCounts.reduce((sum, { count }) => sum + count, 0) },
    ...storeCounts.map(({ store, count }) => ({ key: store.toLowerCase(), label: store, count })),
  ]

  const acceptedPerStore = acceptedStoreCounts(cartReview.acceptedLinks).sort(
    (a, b) => appStores.indexOf(a.store) - appStores.indexOf(b.store),
  )
  const includedStores = acceptedPerStore.map(({ store }) => store).filter((store) => !excludedStores.includes(store))
  const { urls, skipped } = acceptedUrlsToOpen(cartReview.acceptedLinks, includedStores)
  const rejectedCount = counts.rejected || 0
  const otherCarts = (carts || []).filter(({ id, deleted }) => id !== cartReview.cartId && !deleted)

  const openAccepted = () => {
    // Inside the click, so the browser lets the tabs open (when pop-ups are allowed for the site).
    const { blocked } = openInNewTabs(urls)
    const message = openAcceptedNotice({ blocked, skipped })
    if (message) onShowNotice({ message })
  }

  const modify = async (body) => {
    setModifyOpen(false)
    setModifying(true)
    try {
      await onModifyRejected(body)
    } catch (e) {
      console.error('Modifying rejected tracks failed', e)
      onShowNotice({ message: 'Modifying the rejected tracks failed.' })
    } finally {
      setModifying(false)
    }
  }

  return (
    <>
      <TabRow
        name="cart-review-tab"
        label="Review state"
        options={REVIEW_TABS.map(({ key, label, count }) => ({ key, label, count: counts[count] }))}
        selected={cartReview.reviewFilter}
        disabled={disabled}
        onSelect={onSetFilter}
      />
      <TabRow
        name="cart-review-store"
        label="Store"
        options={storeTabs}
        selected={cartReview.storeFocus || 'all'}
        disabled={disabled}
        onSelect={(key) => onSetStoreFocus(key === 'all' ? null : key)}
      />
      <span className="cart-review-actions">
        <DropDownButton
          buttonClassName="cart-review-open"
          data-testid="cart-review-open-accepted"
          title="Open each accepted track in its store in a new tab"
          icon="arrow-up-right-from-square"
          disabled={urls.length === 0}
          onClick={openAccepted}
          popupClassName="popup_content-right cart-review-popup"
          label={
            <>
              <span className="cart-review-label_long">Open accepted</span>
              <span className="cart-review-label_short">Open</span> <small>{urls.length}</small>
            </>
          }
        >
          <div className="cart-review-popup-content">
            <div>Open in:</div>
            {acceptedPerStore.map(({ store, count }) => {
              const id = `cart-review-open-${store}`
              return (
                <div key={store} className="input-layout cart-review-popup-row">
                  <label htmlFor={id} className="noselect">
                    {store} <small>{count}</small>
                  </label>
                  <ToggleButton
                    id={id}
                    controlled
                    checked={!excludedStores.includes(store)}
                    onChange={(include) =>
                      setExcludedStores((current) =>
                        include ? current.filter((s) => s !== store) : current.concat(store),
                      )
                    }
                  />
                </div>
              )
            })}
          </div>
        </DropDownButton>
        <DropDown
          open={modifyOpen}
          onOpenChanged={setModifyOpen}
          disabled={rejectedCount === 0 || modifying}
          popupClassName="popup_content-right cart-review-popup"
          anchor={
            <button
              type="button"
              disabled={rejectedCount === 0 || modifying}
              data-testid="cart-review-modify-rejected"
              title="Remove the rejected tracks from this cart or move them to another cart"
              className="button button-push_button button-push_button-small button-push_button-primary"
            >
              <span className="cart-review-label_long">Modify rejected</span>
              <span className="cart-review-label_short">
                <FontAwesomeIcon icon="xmark" />
              </span>{' '}
              <small>{rejectedCount}</small> <FontAwesomeIcon icon="caret-down" />
            </button>
          }
        >
          <div className="cart-review-popup-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              data-testid="cart-review-remove-rejected"
              className="button button-push_button button-push_button-small button-push_button-primary cart-button"
              onClick={() => modify({ action: 'remove' })}
            >
              <FontAwesomeIcon icon="trash" style={{ marginRight: 6 }} /> Remove from this cart
            </button>
            <hr className="popup-divider" />
            <div>Move to:</div>
            <div className="carts-list">
              {otherCarts.map(({ id, name }) => (
                <button
                  key={id}
                  type="button"
                  className="button button-push_button button-push_button-small button-push_button-primary cart-button"
                  onClick={() => modify({ action: 'move', targetCartId: id })}
                >
                  <FontAwesomeIcon icon="arrow-right" style={{ marginRight: 6 }} /> {name}
                </button>
              ))}
            </div>
            <div className="input-layout">
              <input
                placeholder="New cart"
                aria-label="New cart name"
                style={{ flex: 1 }}
                className="cart-popup-input text-input text-input-large text-input-dark"
                value={newCartName}
                onChange={(e) => setNewCartName(e.target.value)}
              />
              <button
                type="button"
                aria-label="Move to a new cart"
                className="button button-push_button button-push_button-small button-push_button-primary"
                disabled={newCartName.trim() === ''}
                onClick={() => {
                  const name = newCartName.trim()
                  setNewCartName('')
                  modify({ action: 'move', newCartName: name })
                }}
              >
                <FontAwesomeIcon icon="plus" />
              </button>
            </div>
          </div>
        </DropDown>
      </span>
    </>
  )
}

export default CartReviewBar
