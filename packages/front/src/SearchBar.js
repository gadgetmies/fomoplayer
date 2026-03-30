import './SearchBar.css'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { useState, useRef } from 'react'
import Spinner from './Spinner'

/**
 * Attempt to parse a single input string as an entity term (e.g. "artist:42").
 * Returns a term object, or a plain text term if it doesn't match.
 */
const parseInputAsTerm = (text) => {
  const entityMatch = text.match(/^(artist|label|release|track):(\d+)$/i)
  if (entityMatch) {
    return {
      type: entityMatch[1].toLowerCase(),
      value: text,
      id: parseInt(entityMatch[2], 10),
    }
  }
  return { type: 'text', value: text }
}

/**
 * Pill-based search bar.
 *
 * Props:
 *   terms        — committed term objects (controlled, from TopBar)
 *   onChange(committedTerms, inputValue)  — called on every change; TopBar debounces search
 *   onSearch(committedTerms, inputValue)  — called on Enter; TopBar fires immediately
 *   onClearSearch()
 *   loading, disabled, placeholder, styles, className
 */
const SearchBar = ({ terms = [], onChange, onSearch, onClearSearch, loading, disabled, placeholder, styles, className }) => {
  const [inputValue, setInputValue] = useState('')
  const [inQuote, setInQuote] = useState(false)
  const inputRef = useRef(null)

  const focusInput = () => inputRef.current?.focus()

  const getTermLabel = (term) => term.name ?? term.value

  const handleChange = (e) => {
    const value = e.target.value

    // Entering quote mode: first character typed is "
    if (!inQuote && value === '"') {
      setInQuote(true)
      setInputValue('')
      return
    }

    // Exiting quote mode: the opening " was erased
    if (inQuote && value === '') {
      setInQuote(false)
      setInputValue('')
      onChange(terms, '')
      return
    }

    // Closing quote: typed " while already in quote mode (and there's content)
    if (inQuote && value.endsWith('"') && value.length > 1) {
      const quotedText = (value.startsWith('"') ? value.slice(1) : value).slice(0, -1)
      const newTerms = [...terms, { type: 'text', value: quotedText }]
      setInQuote(false)
      setInputValue('')
      onChange(newTerms, '')
      return
    }

    // Commit on space (outside quote mode)
    if (!inQuote && value.endsWith(' ') && value.trim()) {
      const newTerm = parseInputAsTerm(value.trim())
      const newTerms = [...terms, newTerm]
      setInputValue('')
      onChange(newTerms, '')
      return
    }

    setInputValue(value)
    onChange(terms, value)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      let finalTerms = terms
      if (!inQuote && inputValue.trim()) {
        finalTerms = [...terms, parseInputAsTerm(inputValue.trim())]
        setInputValue('')
        onChange(finalTerms, '')
      }
      setInQuote(false)
      onSearch(finalTerms, '')
      return
    }

    // Backspace or Delete at start of empty input → expand last pill back to editable text
    if ((e.key === 'Backspace' || e.key === 'Delete') && inputValue === '' && !inQuote && terms.length > 0) {
      e.preventDefault()
      const lastTerm = terms[terms.length - 1]
      const remainingTerms = terms.slice(0, -1)

      const isMultiWord = lastTerm.type === 'text' && /\s/.test(lastTerm.value)
      const restoredValue = isMultiWord ? '"' + lastTerm.value : lastTerm.value
      setInputValue(restoredValue)
      setInQuote(isMultiWord) // re-enter quote mode so spaces don't split the restored text
      onChange(remainingTerms, restoredValue)
    }
  }

  const removeTerm = (index) => {
    const newTerms = [...terms.slice(0, index), ...terms.slice(index + 1)]
    onChange(newTerms, inputValue)
    focusInput()
  }

  const hasContent = terms.length > 0 || inputValue !== '' || inQuote

  return (
    <div className={`search_container ${className || ''}`} onClick={focusInput}>
      <div className={`search_bar search_bar_pills${inQuote ? ' search_bar_in_quote' : ''}`}>
        {terms.map((term, i) => (
          <span key={i} className={`search_pill search_pill_${term.type}`}>
            {term.type !== 'text' && <span className="search_pill_type">{term.type}</span>}
            <span className="search_pill_name">{getTermLabel(term)}</span>
            <button
              className="search_pill_remove"
              onClick={(e) => {
                e.stopPropagation()
                removeTerm(i)
              }}
              tabIndex={-1}
              aria-label={`Remove ${getTermLabel(term)}`}
            >
              <FontAwesomeIcon icon="times" />
            </button>
          </span>
        ))}
        {inQuote && !inputValue.startsWith('"') && <span className="search_quote_start">&ldquo;</span>}
        <input
          ref={inputRef}
          className={`text-input search search_input_pills ${(styles || '')
            .split(/\s/)
            .map((s) => `text-input-${s}`)
            .join(' ')}`}
          disabled={disabled}
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={!hasContent ? placeholder : ''}
          onClick={(e) => e.stopPropagation()}
          autoComplete="off"
          spellCheck={false}
        />
        {loading ? (
          <Spinner className="search-input-icon" />
        ) : hasContent ? (
          <FontAwesomeIcon
            onClick={(e) => {
              e.stopPropagation()
              onClearSearch()
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
}

export default SearchBar
