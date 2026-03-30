import './SearchBar.css'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { useState, useRef } from 'react'
import Spinner from './Spinner'
import { parseSingleTerm } from './searchTerms'

/**
 * Pill-based search bar.
 *
 * Props:
 *   terms        — committed term objects (controlled, from TopBar)
 *   onChange(committedTerms, inputValue)  — called on every change; TopBar debounces search
 *   onSearch(committedTerms, inputValue)  — called on Enter; TopBar fires immediately
 *   onClearSearch()
 *   loading, disabled, placeholder, styles, className, genres
 */
const SearchBar = ({ terms = [], onChange, onSearch, onClearSearch, loading, disabled, placeholder, styles, className, genres = [] }) => {
  const [inputValue, setInputValue] = useState('')
  const [inQuote, setInQuote] = useState(false)
  const [selectedGenreIndex, setSelectedGenreIndex] = useState(-1)
  const inputRef = useRef(null)

  const focusInput = () => inputRef.current?.focus()

  const getTermLabel = (term) => {
    switch (term.type) {
      case 'bpm':
        if (term.min !== undefined) return `${term.min}–${term.max}`
        if (term.fuzzy) return `~${term.bpm}`
        return `${term.bpm}`
      case 'key':
        return term.compatible ? `~${term.key.toUpperCase()}` : term.key.toUpperCase()
      case 'genre':
        return term.name ?? `${term.id}`
      default:
        return term.name ?? term.value
    }
  }

  const genreSearchText = inputValue.match(/^genre:(.*)/i)?.[1] ?? null
  const showGenrePopup = genreSearchText !== null && genres.length > 0
  const filteredGenres = showGenrePopup
    ? genres.filter((g) => !genreSearchText || g.name.toLowerCase().includes(genreSearchText.toLowerCase()))
    : []

  const commitGenre = (genre) => {
    const newTerm = { type: 'genre', value: `genre:${genre.id}`, id: genre.id, name: genre.name }
    const newTerms = [...terms, newTerm]
    setInputValue('')
    setSelectedGenreIndex(-1)
    onChange(newTerms, '')
    focusInput()
  }

  const handleChange = (e) => {
    const value = e.target.value

    if (genreSearchText !== null && !value.match(/^genre:/i)) {
      setSelectedGenreIndex(-1)
    }

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

    // Commit on space (outside quote mode), but not if in genre search
    if (!inQuote && value.endsWith(' ') && value.trim() && !value.trim().match(/^genre:/i)) {
      const newTerm = parseSingleTerm(value.trim())
      const newTerms = [...terms, newTerm]
      setInputValue('')
      onChange(newTerms, '')
      return
    }

    setInputValue(value)
    onChange(terms, value)
  }

  const handleKeyDown = (e) => {
    if (showGenrePopup) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedGenreIndex((i) => Math.min(i + 1, filteredGenres.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedGenreIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setInputValue('')
        setSelectedGenreIndex(-1)
        onChange(terms, '')
        return
      }
      if (e.key === 'Enter' && selectedGenreIndex >= 0) {
        e.preventDefault()
        commitGenre(filteredGenres[selectedGenreIndex])
        return
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      let finalTerms = terms
      if (!inQuote && inputValue.trim()) {
        finalTerms = [...terms, parseSingleTerm(inputValue.trim())]
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
      {showGenrePopup && filteredGenres.length > 0 && (
        <div className="search_genre_popup">
          {filteredGenres.map((genre, i) => (
            <div
              key={genre.id}
              className={`search_genre_option${i === selectedGenreIndex ? ' search_genre_option_selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                commitGenre(genre)
              }}
            >
              {genre.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SearchBar
