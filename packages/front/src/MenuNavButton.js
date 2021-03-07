import React from 'react'
import { Link } from 'react-router-dom'

export default props => (
  <Link className="no-style-link" to={props.to}>
    <button className={`button menu-item button-push_button-large button-push_button-primary`} {...props} />
  </Link>
)
