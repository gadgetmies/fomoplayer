import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import React, { useEffect, useRef, useState } from 'react'
import SearchBarBase from './SearchBarBase'
import { parseSingleTerm } from './searchTerms'
import { requestJSONwithCredentials } from './request-json-with-credentials'

const ENTITY_TYPES = ['artist', 'label', 'release', 'track']

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
    case 'track':
      return term.similar ? `~${term.name ?? term.id ?? ''}` : term.name ?? `${term.id ?? ''}`
    case 'artist':
    case 'label':
    case 'release':
      return term.name ?? `${term.id ?? ''}`
    default:
      return term.name ?? term.value
  }
}

const GlobalSearchBar = ({
  terms = [],
  onChange,
  onSearch,
  onClearSearch,
  loading,
  disabled,
  placeholder,
  styles,
  className,
  genres = [],
}) => {
  const [inputValue, setInputValue] = useState('')
  const [inQuote, setInQuote] = useState(false)
  const [selectedGenreIndex, setSelectedGenreIndex] = useState(-1)
  const [selectedPillStart, setSelectedPillStart] = useState(null)
  const [selectedPillEnd, setSelectedPillEnd] = useState(null)
  const inputRef = useRef(null)
  const selectAllPressedRef = useRef(false)
  const entitySearchSeqRef = useRef(0)
  const entityResolveInFlightRef = useRef(new Set())
  const inputValueRef = useRef('')
  const [entityResults, setEntityResults] = useState([])
  const [entitySearchType, setEntitySearchType] = useState(null)
  const [selectedEntityIndex, setSelectedEntityIndex] = useState(-1)

  inputValueRef.current = inputValue

  const scrollInputIntoView = () => {
    const input = inputRef.current
    if (!input) return
    const bar = input.parentElement
    if (bar) bar.scrollLeft = bar.scrollWidth
  }

  const focusInput = () => {
    inputRef.current?.focus()
    scrollInputIntoView()
  }

  useEffect(() => {
    scrollInputIntoView()
  }, [terms.length, inputValue])
  const clearPillSelection = () => {
    setSelectedPillStart(null)
    setSelectedPillEnd(null)
  }
  const hasSelectedPills = selectedPillStart !== null && selectedPillEnd !== null
  const selectedPillFrom = hasSelectedPills ? Math.min(selectedPillStart, selectedPillEnd) : -1
  const selectedPillTo = hasSelectedPills ? Math.max(selectedPillStart, selectedPillEnd) : -1

  const genreSearchText = inputValue.match(/^genre:(.*)/i)?.[1] ?? null
  const showGenrePopup = genreSearchText !== null && genres.length > 0
  const filteredGenres = showGenrePopup
    ? genres.filter((g) => !genreSearchText || g.name.toLowerCase().includes(genreSearchText.toLowerCase()))
    : []

  const entityPrefixMatch = inputValue.match(/^(artist|label|release|track):(~?)(.+)$/i)
  const entitySearchPrefix = entityPrefixMatch?.[1].toLowerCase() ?? null
  const entitySearchSimilar = entityPrefixMatch?.[2] === '~'
  const entitySearchText = entityPrefixMatch?.[3] ?? null
  const entitySearchIsId = entitySearchText !== null && /^\d+$/.test(entitySearchText)
  const showEntityPopup =
    entitySearchPrefix !== null &&
    entitySearchText !== null &&
    !entitySearchIsId &&
    entitySearchType === entitySearchPrefix &&
    entityResults.length > 0

  useEffect(() => {
    if (entitySearchPrefix === null || entitySearchText === null || entitySearchIsId) {
      setEntityResults([])
      setEntitySearchType(null)
      setSelectedEntityIndex(-1)
      return
    }
    const seq = ++entitySearchSeqRef.current
    const handle = setTimeout(async () => {
      try {
        const results = await requestJSONwithCredentials({
          path: `/entities/search?type=${entitySearchPrefix}&q=${encodeURIComponent(entitySearchText)}`,
        })
        if (seq !== entitySearchSeqRef.current) return
        setEntityResults(Array.isArray(results) ? results : [])
        setEntitySearchType(entitySearchPrefix)
        setSelectedEntityIndex(-1)
      } catch {
        if (seq !== entitySearchSeqRef.current) return
        setEntityResults([])
        setEntitySearchType(null)
      }
    }, 200)
    return () => clearTimeout(handle)
  }, [entitySearchPrefix, entitySearchText, entitySearchIsId])

  useEffect(() => {
    let cancelled = false
    const namelessIdTerms = terms
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => ENTITY_TYPES.includes(t.type) && t.id !== undefined && t.id !== null && !t.name)
    const nameOnlyTerms = terms
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => ENTITY_TYPES.includes(t.type) && (t.id === undefined || t.id === null) && t.name)

    const todo = []

    namelessIdTerms.forEach(({ t }) => {
      const key = `${t.type}:id:${t.id}`
      if (entityResolveInFlightRef.current.has(key)) return
      entityResolveInFlightRef.current.add(key)
      todo.push(
        (async () => {
          try {
            if (t.type === 'track') {
              const tracks = await requestJSONwithCredentials({
                path: `/tracks/?q=${encodeURIComponent(`track:${t.id}`)}&limit=1&offset=0`,
              })
              const track = tracks?.[0]
              if (!track) return null
              const trackVersion = track.version ? ` (${track.version})` : ''
              return { match: (term) => term.type === 'track' && term.id === t.id, name: `${track.title}${trackVersion}` }
            }
            const data = await requestJSONwithCredentials({ path: `/${t.type}s/${t.id}` })
            return data?.name
              ? { match: (term) => term.type === t.type && term.id === t.id, name: data.name }
              : null
          } catch {
            return null
          } finally {
            entityResolveInFlightRef.current.delete(key)
          }
        })(),
      )
    })

    nameOnlyTerms.forEach(({ t }) => {
      const key = `${t.type}:name:${t.name.toLowerCase()}`
      if (entityResolveInFlightRef.current.has(key)) return
      entityResolveInFlightRef.current.add(key)
      todo.push(
        (async () => {
          try {
            const results = await requestJSONwithCredentials({
              path: `/entities/search?type=${t.type}&q=${encodeURIComponent(t.name)}&limit=5`,
            })
            const exact = (results || []).find((r) => r.name.toLowerCase() === t.name.toLowerCase()) || (results || [])[0]
            if (!exact) return null
            return {
              match: (term) =>
                term.type === t.type && (term.id === undefined || term.id === null) && term.name === t.name,
              id: exact.id,
              name: exact.name,
            }
          } catch {
            return null
          } finally {
            entityResolveInFlightRef.current.delete(key)
          }
        })(),
      )
    })

    if (todo.length === 0) return
    Promise.all(todo).then((updates) => {
      if (cancelled) return
      const filtered = updates.filter(Boolean)
      if (filtered.length === 0) return
      const updatedTerms = terms.map((term) => {
        const u = filtered.find((x) => x.match(term))
        if (!u) return term
        const next = { ...term }
        if (u.id !== undefined) next.id = u.id
        if (u.name !== undefined) next.name = u.name
        const similarPrefix = term.type === 'track' && term.similar ? '~' : ''
        next.value = `${term.type}:${similarPrefix}${next.id ?? next.name}`
        return next
      })
      onChange(updatedTerms, inputValueRef.current)
    })

    return () => {
      cancelled = true
    }
  }, [terms])

  const clearEverything = () => {
    selectAllPressedRef.current = false
    clearPillSelection()
    setInputValue('')
    setInQuote(false)
    setSelectedGenreIndex(-1)
    setSelectedEntityIndex(-1)
    setEntityResults([])
    setEntitySearchType(null)
    onClearSearch()
  }

  const commitGenre = (genre) => {
    const newTerm = { type: 'genre', value: `genre:${genre.id}`, id: genre.id, name: genre.name }
    const newTerms = [...terms, newTerm]
    setInputValue('')
    setSelectedGenreIndex(-1)
    onChange(newTerms, '')
    focusInput()
  }

  const commitEntity = (entity) => {
    const similarPrefix = entitySearchPrefix === 'track' && entitySearchSimilar ? '~' : ''
    const newTerm = {
      type: entitySearchPrefix,
      value: `${entitySearchPrefix}:${similarPrefix}${entity.id}`,
      id: entity.id,
      name: entity.name,
      ...(entitySearchPrefix === 'track' && entitySearchSimilar ? { similar: true } : {}),
    }
    const newTerms = [...terms, newTerm]
    setInputValue('')
    setSelectedEntityIndex(-1)
    setEntityResults([])
    setEntitySearchType(null)
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

    if (!inQuote && value === '"') {
      setInQuote(true)
      setInputValue('')
      return
    }

    if (inQuote && value === '') {
      setInQuote(false)
      setInputValue('')
      onChange(terms, '')
      return
    }

    if (inQuote && value.endsWith('"') && value.length > 1) {
      const quotedText = (value.startsWith('"') ? value.slice(1) : value).slice(0, -1)
      const newTerms = [...terms, { type: 'text', value: quotedText }]
      setInQuote(false)
      setInputValue('')
      onChange(newTerms, '')
      return
    }

    const trimmed = value.trim()
    const isGenrePrefix = /^genre:/i.test(trimmed)
    if (!inQuote && value.endsWith(' ') && trimmed && !isGenrePrefix) {
      const newTerm = parseSingleTerm(trimmed)
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

    if (showEntityPopup) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedEntityIndex((i) => Math.min(i + 1, entityResults.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedEntityIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setEntityResults([])
        setEntitySearchType(null)
        setSelectedEntityIndex(-1)
        return
      }
      if (e.key === 'Enter' && selectedEntityIndex >= 0) {
        e.preventDefault()
        commitEntity(entityResults[selectedEntityIndex])
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
      clearEverything()
      return
    }

    if (hasSelectedPills && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault()
      clearPillSelection()
      const remainingTerms = terms.filter((_, i) => i < selectedPillFrom || i > selectedPillTo)
      onChange(remainingTerms, inputValue)
      return
    }

    if ((e.key === 'Backspace' || e.key === 'Delete') && inputValue === '' && !inQuote && terms.length > 0) {
      selectAllPressedRef.current = false
      clearPillSelection()
      e.preventDefault()
      const lastTerm = terms[terms.length - 1]
      const remainingTerms = terms.slice(0, -1)
      const isMultiWord = lastTerm.type === 'text' && /\s/.test(lastTerm.value)
      const restoredValue = isMultiWord ? `"${lastTerm.value}` : lastTerm.value
      setInputValue(restoredValue)
      setInQuote(isMultiWord)
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
    <SearchBarBase
      className={className}
      barClassName={`search_bar search_bar_pills${inQuote ? ' search_bar_in_quote' : ''}`}
      styles={styles}
      disabled={disabled}
      value={inputValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={!hasContent ? placeholder : ''}
      loading={loading}
      hasContent={hasContent}
      onClearSearch={clearEverything}
      inputRef={inputRef}
      onContainerClick={() => {
        clearPillSelection()
        focusInput()
      }}
      onInputClick={(e) => {
        e.stopPropagation()
        clearPillSelection()
      }}
      inputClassName="search search_input_pills"
      childrenBeforeInput={
        <>
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
        </>
      }
      childrenAfterInput={
        showGenrePopup && filteredGenres.length > 0 ? (
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
        ) : showEntityPopup ? (
          <div className="search_genre_popup">
            {entityResults.map((entity, i) => (
              <div
                key={`${entitySearchPrefix}-${entity.id}`}
                className={`search_genre_option${i === selectedEntityIndex ? ' search_genre_option_selected' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  commitEntity(entity)
                }}
              >
                {entity.name}
              </div>
            ))}
          </div>
        ) : null
      }
    />
  )
}

export default GlobalSearchBar
