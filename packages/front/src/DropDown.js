import React from 'react'
import Popup from './Popup'

const DropDown = (props) => (
  <Popup
    disabled={props.disabled}
    className={props.className}
    style={props.style}
    anchor={<span className={'popup-anchor'}>{props.anchor}</span>}
    popupClassName={props.popupClassName}
    popupStyle={props.popupStyle}
  >
    {!props.disabled && props.children}
  </Popup>
)

export default DropDown
