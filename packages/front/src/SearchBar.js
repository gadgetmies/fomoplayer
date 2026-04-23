import React from 'react'
import SearchBarBase from './SearchBarBase'

const SearchBar = ({ value = '', onChange, onClearSearch, loading, disabled, placeholder, styles, className }) => (
  <SearchBarBase
    className={className}
    styles={styles}
    disabled={disabled}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    loading={loading}
    hasContent={value !== ''}
    onClearSearch={onClearSearch}
  />
)

export default SearchBar
