import './CartReviewBar.css'
import React, { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { isMobile } from 'react-device-detect'
import DropDown from './DropDown'
import ToggleButton from './ToggleButton'
import TabSelector from './TabSelector'
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

// A bar button that opens its menu on click (on every device, not on hover). The menu lines up with the button's
// right edge, so it stays on screen at the bar's right end.
const MenuButton = ({ open, onOpenChanged, disabled, testId, title, label, children }) => (
  <DropDown
    open={open}
    openOnHover={false}
    onOpenChanged={onOpenChanged}
    disabled={disabled}
    popupClassName="popup_content-left cart-review-popup"
    anchor={
      <button
        type="button"
        disabled={disabled}
        data-testid={testId}
        title={title}
        className="button button-push_button button-push_button-small button-push_button-primary"
      >
        {label} <FontAwesomeIcon icon="caret-down" />
      </button>
    }
  >
    <div className="cart-review-popup-content" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  </DropDown>
)

const MenuItem = ({ icon, testId, onClick, children }) => (
  <button
    type="button"
    data-testid={testId}
    className="button button-push_button button-push_button-small button-push_button-primary cart-button"
    onClick={onClick}
  >
    <FontAwesomeIcon icon={icon} style={{ marginRight: 6 }} /> {children}
  </button>
)

// Move to one of the user's other carts, or to a new cart named here.
const MoveToCartItems = ({ carts, onMove }) => {
  const [newCartName, setNewCartName] = useState('')
  return (
    <>
      <div>Move to:</div>
      <div className="carts-list">
        {carts.map(({ id, name }) => (
          <MenuItem key={id} icon="arrow-right" onClick={() => onMove({ action: 'move', targetCartId: id })}>
            {name}
          </MenuItem>
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
            onMove({ action: 'move', newCartName: name })
          }}
        >
          <FontAwesomeIcon icon="plus" />
        </button>
      </div>
    </>
  )
}

// The review controls of a cart under review: the review-state tabs, the store tabs, Modify accepted and Modify
// rejected.
const CartReviewBar = ({
  cartReview,
  carts,
  stores,
  disabled,
  onSetFilter,
  onSetStoreFocus,
  onModifyReviewed,
  onMarkAcceptedPurchased,
  onShowNotice,
}) => {
  const [openMenu, setOpenMenu] = useState(null)
  const [busy, setBusy] = useState(false)
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
  const acceptedCount = counts.accepted || 0
  const rejectedCount = counts.rejected || 0
  const otherCarts = (carts || []).filter(({ id, deleted }) => id !== cartReview.cartId && !deleted)
  const menuProps = (name) => ({
    open: openMenu === name,
    onOpenChanged: (open) => setOpenMenu(open ? name : null),
  })

  // Opens every accepted track carried by the store in a new tab, within the click so the browser lets them open.
  // Phones open one tab per tap at most, so the option is offered on desktops only.
  const openInStore = (store) => {
    setOpenMenu(null)
    const { urls } = acceptedUrlsToOpen(cartReview.acceptedLinks, [store])
    const { blocked } = openInNewTabs(urls)
    const message = openAcceptedNotice({ blocked, skipped: 0 })
    if (message) onShowNotice({ message })
  }

  const run = async (action, failure) => {
    setOpenMenu(null)
    setBusy(true)
    try {
      await action()
    } catch (e) {
      console.error(failure, e)
      onShowNotice({ message: `${failure}.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TabSelector
        name="cart-review-tab"
        label="Review state"
        options={REVIEW_TABS.map(({ key, label, count }) => ({ key, label, count: counts[count] }))}
        selected={cartReview.reviewFilter}
        disabled={disabled}
        onSelect={onSetFilter}
      />
      <TabSelector
        name="cart-review-store"
        label="Store"
        options={storeTabs}
        selected={cartReview.storeFocus || 'all'}
        disabled={disabled}
        onSelect={(key) => onSetStoreFocus(key === 'all' ? null : key)}
      />
      <span className="cart-review-actions">
        <MenuButton
          {...menuProps('accepted')}
          disabled={acceptedCount === 0 || busy}
          testId="cart-review-modify-accepted"
          title="Open the accepted tracks in their stores, mark them purchased or move them to another cart"
          label={
            <>
              <span className="cart-review-label_long">Modify accepted</span>
              <span className="cart-review-label_short">
                <FontAwesomeIcon icon="check" />
              </span>{' '}
              <small>{acceptedCount}</small>
            </>
          }
        >
          {!isMobile &&
            acceptedPerStore.map(({ store, count }) => (
              <MenuItem
                key={store}
                icon="arrow-up-right-from-square"
                testId={`cart-review-open-${store.toLowerCase()}`}
                onClick={() => openInStore(store)}
              >
                Open {count} in {store}
              </MenuItem>
            ))}
          {!isMobile && acceptedPerStore.length > 0 && <hr className="popup-divider" />}
          <MenuItem
            icon="cart-shopping"
            testId="cart-review-mark-purchased"
            onClick={() => run(onMarkAcceptedPurchased, 'Marking the accepted tracks purchased failed')}
          >
            Mark as purchased
          </MenuItem>
          <hr className="popup-divider" />
          <MoveToCartItems
            carts={otherCarts}
            onMove={(body) => run(() => onModifyReviewed('accepted', body), 'Moving the accepted tracks failed')}
          />
        </MenuButton>
        <MenuButton
          {...menuProps('rejected')}
          disabled={rejectedCount === 0 || busy}
          testId="cart-review-modify-rejected"
          title="Remove the rejected tracks from this cart or move them to another cart"
          label={
            <>
              <span className="cart-review-label_long">Modify rejected</span>
              <span className="cart-review-label_short">
                <FontAwesomeIcon icon="xmark" />
              </span>{' '}
              <small>{rejectedCount}</small>
            </>
          }
        >
          <MenuItem
            icon="trash"
            testId="cart-review-remove-rejected"
            onClick={() =>
              run(() => onModifyReviewed('rejected', { action: 'remove' }), 'Modifying the rejected tracks failed')
            }
          >
            Remove from this cart
          </MenuItem>
          <hr className="popup-divider" />
          <MoveToCartItems
            carts={otherCarts}
            onMove={(body) => run(() => onModifyReviewed('rejected', body), 'Moving the rejected tracks failed')}
          />
        </MenuButton>
      </span>
    </>
  )
}

export default CartReviewBar
