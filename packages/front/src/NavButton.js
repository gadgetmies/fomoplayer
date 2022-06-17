import React from 'react'
import { NavLink } from 'react-router-dom'

export default props => (
  <NavLink
    className="no-style-link button button-push_button-small button-push_button-primary button button-push_button-small"
    to={props.to}
    {...props}
  ></NavLink>
)
