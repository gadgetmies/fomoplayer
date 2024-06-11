import './SearchBar.css'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React from 'react'

const SearchBar = (props) => (
  <div className={'search_container'}>
    <label className="search_bar">
      <input
        className={`text-input search ${(props.styles || '')
          .split(/\s/)
          .map((s) => `text-input-${s}`)
          .join(' ')}`}
        disabled={props.disabled}
        value={props.value}
        onChange={props.onChange}
        placeholder={props.placeholder}
        onClick={(e) => e.stopPropagation()}
      />
      {props.value !== '' ? (
        <FontAwesomeIcon
          onClick={(e) => {
            e.stopPropagation()
            props.onClearSearch()
          }}
          className={'search-input-icon clear-search'}
          icon="times-circle"
        />
      ) : (
        <FontAwesomeIcon className={'search-input-icon'} icon="search" />
      )}
    </label>
  </div>
)

export default SearchBar
