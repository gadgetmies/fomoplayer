import React, { useEffect, useState } from 'react'

const globalClickHandler = ({ e, open, setOpen, onOpenChanged }) => {
  if (!onOpenChanged) {
    setOpen(!open)
    e.stopPropagation()
    e.preventDefault()
  } else {
    onOpenChanged(!open)
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
  onOpenChanged
}) => {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(
    props => {
      setOpen(defaultOpen)
    },
    [defaultOpen]
  )
  const clickHandler = e => globalClickHandler({ e, open, setOpen, onOpenChanged })
  return (
    <>
      <div className={`popup_container ${open ? 'popup--open' : ''} ${className || ''}`} style={style}>
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
