import React from 'react'
import { NavLink } from 'react-router-dom'
import * as R from 'ramda'
import './buttons.css'

export default (props) => (
  <NavLink
    className={`no-style-link button button-top_bar_button ${props.selected ? 'button-top_bar_button--selected' : ''}`}
    to={props.to}
    onFocus={(e) => {
      e.target.blur()
      props.onFocus && props.onFocus()
    }}
    {...R.omit(['className', 'icon', 'onFocus'], props)}
    style={{ display: 'flex', justifyContent: 'center' }}
    onClick={(e) => {
      if (props.onClick) {
        props.onClick()
      }
      if (props.disabled || props.to === '') {
        e.preventDefault()
      }
    }}
  >
    <span className="button-top_bar_button_icon">{props.icon}</span>
    <span className="button-top_bar_button_label">{props.label}</span>
  </NavLink>
)
