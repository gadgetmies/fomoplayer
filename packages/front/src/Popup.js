import React, { useEffect, useState } from 'react'
import { isMobile } from 'react-device-detect'

let closePreviousFn

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
}) => {
  const openOnHover = openOnHoverProp || !isMobile
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
        className={`popup_container popup_container${openOnHover === true ? '--open-on-hover' : ''} ${open ? 'popup--open' : ''} ${className || ''}`}
        style={style}
      >
        <span className={'popup-anchor'} onClick={clickHandler} onDoubleClick={clickHandler}>
          {anchor}
        </span>
        {!disabled && (
          <div className={`popup_content ${popupClassName || ''}`} style={popupStyle}>
            {children}
          </div>
        )}
      </div>
      <div className="popup_overlay" onClick={clickHandler} onDoubleClick={clickHandler} />
    </>
  )
}

export default Popup
