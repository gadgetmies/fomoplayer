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
  const [selectedPillStart, setSelectedPillStart] = useState(null)
  const [selectedPillEnd, setSelectedPillEnd] = useState(null)
  const inputRef = useRef(null)
  const selectAllPressedRef = useRef(false)

  const focusInput = () => inputRef.current?.focus()
  const clearPillSelection = () => {
    setSelectedPillStart(null)
    setSelectedPillEnd(null)
  }
  const hasSelectedPills = selectedPillStart !== null && selectedPillEnd !== null
  const selectedPillFrom = hasSelectedPills ? Math.min(selectedPillStart, selectedPillEnd) : -1
  const selectedPillTo = hasSelectedPills ? Math.max(selectedPillStart, selectedPillEnd) : -1

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
    selectAllPressedRef.current = false
    clearPillSelection()

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
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      selectAllPressedRef.current = true
      if (terms.length > 0) {
        setSelectedPillStart(0)
        setSelectedPillEnd(terms.length - 1)
      } else {
        clearPillSelection()
      }
      return
    }

    if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && inputValue === '' && !inQuote && terms.length > 0) {
      e.preventDefault()
      selectAllPressedRef.current = false

      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'ArrowLeft') {
          setSelectedPillStart(0)
          setSelectedPillEnd(terms.length - 1)
        } else {
          clearPillSelection()
        }
        return
      }

      if (e.key === 'ArrowLeft') {
        if (!hasSelectedPills) {
          setSelectedPillStart(terms.length - 1)
          setSelectedPillEnd(terms.length - 1)
        } else {
          setSelectedPillStart(Math.max(0, selectedPillFrom - 1))
          setSelectedPillEnd(selectedPillTo)
        }
      } else if (hasSelectedPills) {
        const nextStart = selectedPillFrom + 1
        if (nextStart > selectedPillTo) {
          clearPillSelection()
        } else {
          setSelectedPillStart(nextStart)
          setSelectedPillEnd(selectedPillTo)
        }
      }
      return
    }

    if (
      hasSelectedPills &&
      !e.shiftKey &&
      (e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'Home' ||
        e.key === 'End')
    ) {
      clearPillSelection()
    }

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
      selectAllPressedRef.current = false
      clearPillSelection()
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

    if (selectAllPressedRef.current && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault()
      selectAllPressedRef.current = false
      clearPillSelection()
      setInputValue('')
      setInQuote(false)
      setSelectedGenreIndex(-1)
      onClearSearch()
      return
    }

    if (hasSelectedPills && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault()
      clearPillSelection()
      const remainingTerms = terms.filter((_, i) => i < selectedPillFrom || i > selectedPillTo)
      onChange(remainingTerms, inputValue)
      return
    }

    // Backspace or Delete at start of empty input → expand last pill back to editable text
    if ((e.key === 'Backspace' || e.key === 'Delete') && inputValue === '' && !inQuote && terms.length > 0) {
      selectAllPressedRef.current = false
      clearPillSelection()
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
    clearPillSelection()
    const newTerms = [...terms.slice(0, index), ...terms.slice(index + 1)]
    onChange(newTerms, inputValue)
    focusInput()
  }

  const hasContent = terms.length > 0 || inputValue !== '' || inQuote

  return (
    <div
      className={`search_container ${className || ''}`}
      onClick={() => {
        clearPillSelection()
        focusInput()
      }}
    >
      <div className={`search_bar search_bar_pills${inQuote ? ' search_bar_in_quote' : ''}`}>
        {terms.map((term, i) => (
          <span
            key={i}
            className={`search_pill search_pill_${term.type}${
              hasSelectedPills && i >= selectedPillFrom && i <= selectedPillTo ? ' search_pill_selected' : ''
            }`}
          >
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
          onClick={(e) => {
            e.stopPropagation()
            clearPillSelection()
          }}
          autoComplete="off"
          spellCheck={false}
        />
        {loading ? (
          <Spinner className="search-input-icon" />
        ) : hasContent ? (
          <FontAwesomeIcon
            onClick={(e) => {
              e.stopPropagation()
              selectAllPressedRef.current = false
              clearPillSelection()
              setInputValue('')
              setInQuote(false)
              setSelectedGenreIndex(-1)
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
