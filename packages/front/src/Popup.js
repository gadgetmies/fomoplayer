import React, { useEffect, useState } from 'react'
import { isMobile } from 'react-device-detect'

let closePreviousFn

/*
NOTICE: Do not use padding in the style property or in the classes defined in className as those
will break the open on hover functionality. If you need padding, add that using a wrapping element.
 */

const globalClickHandler = ({ e, open: isOpen, setOpen, onOpenChanged, closePrevious }) => {
  if (!isOpen) {
    closePreviousFn ? closePreviousFn() : ''
    closePreviousFn = closePrevious
  }

  if (!onOpenChanged) {
    setOpen(!isOpen)
    e.stopPropagation()
    e.preventDefault()
  } else {
    onOpenChanged(!isOpen)
  }
}

// A popup opened from a track row is rendered inside the row, and on a phone the row swipes (mark heard, accept or
// reject) on a sideways drag. Touches on the popup and on the overlay behind it belong to the popup, so they stop here
// instead of bubbling to the row (or to the track list's pull-to-refresh). Only bubbling is stopped, not the browser's
// default action, so scrolling and tapping inside the popup keep working.
const stopTouchPropagation = (e) => e.stopPropagation()
const touchHandlers = {
  onTouchStart: stopTouchPropagation,
  onTouchMove: stopTouchPropagation,
  onTouchEnd: stopTouchPropagation,
  onTouchCancel: stopTouchPropagation,
}

const Popup = ({
  open: defaultOpen,
  popupStyle,
  children,
  style,
  className,
  popupClassName,
  anchor,
  disabled,
  onOpenChanged,
  openOnHover: openOnHoverProp,
  popupAbove
}) => {
  const openOnHover = openOnHoverProp === undefined ? !isMobile : openOnHoverProp
  const [open, setOpen] = useState(defaultOpen)
  useEffect(
    (props) => {
      setOpen(defaultOpen)
    },
    [defaultOpen],
  )
  const clickHandler = (e) =>
    openOnHover !== true &&
    globalClickHandler({
      e,
      open,
      setOpen,
      onOpenChanged,
      closePrevious: () => {
        setOpen(false)
        onOpenChanged && onOpenChanged(false)
      },
    })

  return (
    <>
      <div
        className={`popup_container ${openOnHover === true ? 'popup_container--open-on-hover' : ''} ${open ? 'popup--open' : ''} ${className || ''}`}
        style={style}
      >
        <span className={'popup-anchor'} onClick={clickHandler} onDoubleClick={clickHandler}>
          {anchor}
        </span>
        {!disabled && (openOnHover || open) && (
          <div
            className={`popup_content ${popupClassName || ''} ${popupAbove ? 'popup_content__above' : ''}`}
            style={popupStyle}
            {...touchHandlers}
          >
            {children}
          </div>
        )}
      </div>
      <div className="popup_overlay" onClick={clickHandler} onDoubleClick={clickHandler} {...touchHandlers} />
    </>
  )
}

export default Popup
