import React from 'react'
import { NavLink } from 'react-router-dom'

export default props => (
  <NavLink
    className="no-style-link button menu-item button-push_button-large button-push_button-menu"
    activeClassName="button-push_button-menu-active"
    to={props.to}
    {...props}
  ></NavLink>
)
