import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { useCallback, useEffect, useRef, useState } from 'react'

// Pixels per line for wheel events reported in lines (Firefox with a mouse).
const WHEEL_LINE_HEIGHT = 16
// Share of the visible width an arrow click scrolls, so the card at the edge
// stays partly visible as an anchor.
const ARROW_SCROLL_RATIO = 0.8

// A single-row, horizontally scrollable list of follow cards.
//
// - Touch: native horizontal swipe. The row never scrolls vertically, so
//   vertical swipes scroll the page.
// - Mouse: previous/next arrow buttons (shown only for a fine, hovering
//   pointer, see Settings.css) and Shift + wheel. A plain vertical wheel always
//   scrolls the page, never the row.
// - A fade on either edge marks the side that has more cards.
const FollowCarousel = ({ children, 'data-test': dataTest, label }) => {
  const listRef = useRef(null)
  const [scrollState, setScrollState] = useState({ canScrollLeft: false, canScrollRight: false })

  const updateScrollState = useCallback(() => {
    const list = listRef.current
    if (!list) return
    const maxScrollLeft = list.scrollWidth - list.clientWidth
    const next = {
      canScrollLeft: list.scrollLeft > 1,
      canScrollRight: list.scrollLeft < maxScrollLeft - 1,
    }
    setScrollState((previous) =>
      previous.canScrollLeft === next.canScrollLeft && previous.canScrollRight === next.canScrollRight
        ? previous
        : next,
    )
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (!list) return undefined

    // Shift + vertical wheel scrolls the row sideways. Browsers that already
    // turn Shift + wheel into a horizontal delta (deltaX) are left alone, and
    // so is the wheel once the row is at the end it is scrolling towards, so the
    // gesture never feels stuck.
    const onWheel = (event) => {
      if (!event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      const delta = event.deltaMode === 1 ? event.deltaY * WHEEL_LINE_HEIGHT : event.deltaY
      const maxScrollLeft = list.scrollWidth - list.clientWidth
      const atStart = list.scrollLeft <= 0 && delta < 0
      const atEnd = list.scrollLeft >= maxScrollLeft - 1 && delta > 0
      if (maxScrollLeft <= 0 || atStart || atEnd) return
      event.preventDefault()
      list.scrollLeft += delta
    }

    list.addEventListener('wheel', onWheel, { passive: false })
    list.addEventListener('scroll', updateScrollState, { passive: true })
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updateScrollState) : null
    resizeObserver?.observe(list)
    updateScrollState()
    return () => {
      list.removeEventListener('wheel', onWheel)
      list.removeEventListener('scroll', updateScrollState)
      resizeObserver?.disconnect()
    }
  }, [updateScrollState])

  // Cards are added and removed (search results streaming in, suggestions
  // ignored) without the list resizing, so re-check after every render.
  useEffect(updateScrollState)

  const scrollByPage = (direction) => {
    const list = listRef.current
    if (!list) return
    list.scrollBy({ left: direction * list.clientWidth * ARROW_SCROLL_RATIO, behavior: 'smooth' })
  }

  const { canScrollLeft, canScrollRight } = scrollState
  const overflows = canScrollLeft || canScrollRight

  return (
    <div className="follow-carousel" data-can-scroll-left={canScrollLeft} data-can-scroll-right={canScrollRight}>
      {overflows && (
        <button
          type="button"
          className="button button-push_button button-push_button-small button-push_button-primary follow-carousel-arrow follow-carousel-arrow--previous"
          disabled={!canScrollLeft}
          aria-label={`Scroll ${label} left`}
          title="Previous"
          data-test="follow-carousel-previous"
          onClick={() => scrollByPage(-1)}
        >
          <FontAwesomeIcon icon="chevron-left" />
        </button>
      )}
      <ul ref={listRef} className="no-style-list follow-list follow-list--carousel" data-test={dataTest}>
        {children}
      </ul>
      {overflows && (
        <button
          type="button"
          className="button button-push_button button-push_button-small button-push_button-primary follow-carousel-arrow follow-carousel-arrow--next"
          disabled={!canScrollRight}
          aria-label={`Scroll ${label} right`}
          title="Next"
          data-test="follow-carousel-next"
          onClick={() => scrollByPage(1)}
        >
          <FontAwesomeIcon icon="chevron-right" />
        </button>
      )}
    </div>
  )
}

export default FollowCarousel
