import React from 'react'
import Popup from './Popup'

const DropDown = (props) => {
  return (
    <Popup
      disabled={props.disabled}
      className={props.className}
      style={props.style}
      open={props.open}
      openOnHover={props.openOnHover}
      anchor={props.anchor}
      popupClassName={props.popupClassName}
      popupStyle={props.popupStyle}
      popupAbove={props.popupAbove}
    >
      {!props.disabled && props.children}
    </Popup>
  )
}

export default DropDown
