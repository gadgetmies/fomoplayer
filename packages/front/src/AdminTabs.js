import React from 'react'
import { NavLink } from 'react-router-dom'
import './AdminTabs.css'

export const ADMIN_TABS = [
  { path: '/admin', label: 'Radiator' },
  { path: '/admin/jobs', label: 'Jobs' },
  { path: '/admin/duplicates', label: 'Duplicates' },
  { path: '/admin/mislabeled', label: 'Mislabeled' },
  { path: '/admin/artist-split', label: 'Artist split' },
]

// The tab bar shared by every admin page. Follows the Notifications page's tab bar: a select-button tab row in
// a sticky bar the colour of the other top bars. NavLink marks the current page's tab (class and
// aria-current="page"); `exact` keeps the Radiator tab (/admin) from matching every admin page.
const AdminTabs = () => (
  <div className="top-bar input-layout admin-tabs-top_bar">
    <nav
      aria-label="Admin"
      className="select-button select-button--container state-select-button--container noselect admin-tabs"
    >
      {ADMIN_TABS.map(({ path, label }) => (
        <NavLink
          key={path}
          to={path}
          exact
          className="select_button-button admin-tab"
          activeClassName="select_button-button__active admin-tab--active"
        >
          {label}
        </NavLink>
      ))}
    </nav>
  </div>
)

export default AdminTabs
