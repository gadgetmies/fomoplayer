import React from 'react'

const DropDown = props => (
  <span className={`popup_container`} style={{ display: 'flex', ...props.style }}>
    <span className={'popup-anchor'}>{props.anchor}</span>
    {!props.disabled && (
      <div className={`popup_content ${props.popupClassName || ''}`} style={{ zIndex: 100, ...props.popupStyle }}>
        {props.children}
      </div>
    )}
  </span>
)

export default DropDown
