import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { MemoryRouter } from 'react-router-dom'
import { CartDropDownButton } from './CartDropDownButton'

// Adding a track to a cart (or removing it) from the cart popup must keep the popup open, so the user can put the
// track in several carts without reopening it. While the request runs only the buttons inside the popup are disabled
// and the main cart button shows its spinner.

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const carts = [
  { id: 1, name: 'Default' },
  { id: 2, name: 'Gig' },
]

const renderCartButton = (props) =>
  act(() => {
    root.render(
      <MemoryRouter>
        <CartDropDownButton
          trackId={10}
          carts={carts}
          inCarts={[]}
          currentCartId={1}
          cartFilter=""
          processingCart={false}
          processingTrack={false}
          onCartFilterChange={() => {}}
          onClearCartFilter={() => {}}
          onCartButtonClick={() => {}}
          onCreateCartClick={async () => ({ id: 3 })}
          onMarkPurchasedButtonClick={() => {}}
          {...props}
        />
      </MemoryRouter>,
    )
  })

const cartButtons = () => Array.from(container.querySelectorAll('.cart-popup .cart-button'))

describe('cart popup while a cart request runs', () => {
  it('stays open with its cart buttons disabled', () => {
    renderCartButton()
    expect(cartButtons()).toHaveLength(2)

    renderCartButton({ processingCart: true, processingTrack: true })

    expect(container.querySelector('.cart-popup')).not.toBeNull()
    expect(cartButtons()).toHaveLength(2)
    cartButtons().forEach((button) => expect(button.disabled).toBe(true))
  })

  it('keeps the main cart button disabled and showing its spinner', () => {
    renderCartButton({ processingCart: true, processingTrack: true })
    const mainButton = container.querySelector('.button-drop_down-left')
    expect(mainButton.disabled).toBe(true)
    expect(mainButton.querySelector('.loading-indicator')).not.toBeNull()
  })

  it('enables the cart buttons again when the request finishes', () => {
    renderCartButton({ processingCart: true, processingTrack: true })
    renderCartButton({ processingCart: false, processingTrack: false, inCarts: [{ id: 2 }] })
    expect(container.querySelector('.cart-popup')).not.toBeNull()
    cartButtons().forEach((button) => expect(button.disabled).toBe(false))
  })

  it('stays closed when the cart button itself is disabled (no track playing)', () => {
    renderCartButton({ disabled: true })
    expect(container.querySelector('.cart-popup')).toBeNull()
  })
})
