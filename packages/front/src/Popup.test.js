import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import Popup from './Popup'

// A popup opened from a track row is rendered inside that row, and on a phone the row slides and marks the track
// heard (or decides a cart review) on a sideways swipe. Touches on an open popup or on the dark overlay behind it
// belong to the popup: they must not reach the row's swipe handlers, while scrolling and tapping inside the popup
// keep working (the browser's default action is left alone).

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const TOUCH_EVENTS = ['touchstart', 'touchmove', 'touchend', 'touchcancel']

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

const renderOpenPopupInRow = () => {
  const rowHandlers = {
    onTouchStart: jest.fn(),
    onTouchMove: jest.fn(),
    onTouchEnd: jest.fn(),
    onTouchCancel: jest.fn(),
  }
  act(() => {
    root.render(
      <div className="row" {...rowHandlers}>
        <Popup open openOnHover={false} anchor={<button className="anchor">open</button>}>
          <button className="inside">Cart</button>
        </Popup>
      </div>,
    )
  })
  const rowTouches = () => Object.values(rowHandlers).reduce((count, handler) => count + handler.mock.calls.length, 0)
  return { rowTouches }
}

// Returns whether the default action is still allowed (dispatchEvent is false once preventDefault was called).
const touch = (element, type) => {
  let defaultAllowed
  act(() => {
    defaultAllowed = element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
  })
  return defaultAllowed
}

describe('touches on an open popup', () => {
  it.each(TOUCH_EVENTS)('%s on the popup content does not reach the track row', (type) => {
    const { rowTouches } = renderOpenPopupInRow()
    const defaultAllowed = touch(container.querySelector('.inside'), type)
    expect(rowTouches()).toBe(0)
    expect(defaultAllowed).toBe(true)
  })

  it.each(TOUCH_EVENTS)('%s on the overlay behind the popup does not reach the track row', (type) => {
    const { rowTouches } = renderOpenPopupInRow()
    const defaultAllowed = touch(container.querySelector('.popup_overlay'), type)
    expect(rowTouches()).toBe(0)
    expect(defaultAllowed).toBe(true)
  })

  it('a touch on the anchor button still reaches the track row', () => {
    const { rowTouches } = renderOpenPopupInRow()
    touch(container.querySelector('.anchor'), 'touchstart')
    expect(rowTouches()).toBe(1)
  })
})
