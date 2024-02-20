import './buttons.css'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React from 'react'

const PushButton = props => (
  <button
    disabled={props.disabled}
    className={`${props.className} button button-push_button cart-button ${props.styles
      .split(' ')
      .map(style => `button-push_button-${style}`)
      .join(' ')}`}
    onClick={(e, ...rest) => {
      e.stopPropagation()
      return props.onClick(e, ...rest)
    }}
  >
    <FontAwesomeIcon icon={props.icon} className="button-push_button_icon" />&nbsp;
    {props.label}
  </button>
)

export default PushButton
