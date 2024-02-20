import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import './CollapseHeader.css'

const CollapseHeader = props => {
  const [collapsed, setCollapsed] = React.useState(false)
  return (
    <h4
      className={`noselect collapse-header ${collapsed ? 'collapse-header--collapsed' : ''}`}
      onClick={() => setCollapsed(!collapsed)}
    >
      {props.children}
      <FontAwesomeIcon icon="caret-up" className="collapse-header-icon" />
    </h4>
  )
}

export default CollapseHeader
