import './SearchBar.css'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { useState } from 'react'
import Spinner from './Spinner'

const SearchBar = (props) => (
  <div className={`search_container ${props.className || ''}`}>
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
      {props.loading ? (
        <Spinner className={'search-input-icon'} />
      ) : props.value !== '' ? (
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
