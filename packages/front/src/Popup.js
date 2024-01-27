import React from 'react'

const clickHandler = (e, props, open, setOpen) => {
  console.log('click handler')
  setOpen(!open)
  e.stopPropagation()
  e.preventDefault()
  props.onClick && props.onClick(e)
}

const Popup = props => {
  const [open, setOpen] = React.useState(props.open)
  return (
    <>
      <div className={`popup_container ${open ? 'popup--open' : ''} ${props.className || ''}`} style={props.style}>
        <span
          className={'popup-anchor'}
          onClick={e => clickHandler(e, props, open, setOpen)}
          onDoubleClick={e => clickHandler(e, props, open, setOpen)}
        >
          {props.anchor}
        </span>
        <div className={`popup_content ${props.popupClassName || ''}`} style={props.popupStyle}>
          {props.children}
        </div>
      </div>
      <div
        className="popup_overlay"
        onClick={e => clickHandler(e, props, open, setOpen)}
        onDoubleClick={e => clickHandler(e, props, open, setOpen)}
      />
    </>
  )
}

export default Popup
