import './SearchBar.css'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React from 'react'
import Spinner from './Spinner'

const getInputClassName = (styles, inputClassName = 'search') => {
  const styleClasses = (styles || '')
    .split(/\s/)
    .filter(Boolean)
    .map((style) => `text-input-${style}`)
    .join(' ')
  return `text-input ${inputClassName} ${styleClasses}`.trim()
}

const SearchBarBase = ({
  className,
  barClassName = 'search_bar',
  styles,
  disabled,
  value,
  onChange,
  onKeyDown,
  placeholder,
  loading,
  hasContent,
  onClearSearch,
  inputRef,
  onContainerClick,
  onInputClick,
  inputClassName,
  childrenBeforeInput,
  childrenAfterInput,
}) => (
  <div className={`search_container ${className || ''}`} onClick={onContainerClick}>
    <div className={barClassName}>
      {childrenBeforeInput}
      <input
        ref={inputRef}
        className={getInputClassName(styles, inputClassName)}
        disabled={disabled}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        onClick={onInputClick}
        autoComplete="off"
        spellCheck={false}
      />
      {childrenAfterInput}
      {loading ? (
        <Spinner className="search-input-icon" />
      ) : hasContent ? (
        <FontAwesomeIcon
          onClick={(e) => {
            e.stopPropagation()
            onClearSearch?.()
          }}
          className="search-input-icon clear-search"
          icon="times-circle"
        />
      ) : (
        <FontAwesomeIcon className="search-input-icon" icon="search" />
      )}
    </div>
  </div>
)

export default SearchBarBase
