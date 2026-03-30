const splitTextByWhitespace = (text) => {
  if (!text) {
    return []
  }

  const trimmed = text.trim()
  if (!trimmed) {
    return []
  }

  const terms = []
  let inQuotes = false
  let quoteChar = null
  let currentTerm = ''
  let i = 0

  while (i < trimmed.length) {
    const char = trimmed[i]
    const isQuote = char === '"' || char === "'"
    const isWhitespace = /\s/.test(char)

    if (isQuote && !inQuotes) {
      if (currentTerm.trim()) {
        terms.push({ type: 'text', value: currentTerm.trim() })
        currentTerm = ''
      }
      inQuotes = true
      quoteChar = char
      i++
      continue
    } else if (isQuote && inQuotes && char === quoteChar) {
      if (currentTerm) {
        terms.push({ type: 'text', value: currentTerm })
        currentTerm = ''
      }
      inQuotes = false
      quoteChar = null
      i++
      continue
    } else if (isWhitespace && !inQuotes) {
      if (currentTerm.trim()) {
        terms.push({ type: 'text', value: currentTerm.trim() })
        currentTerm = ''
      }
      i++
      continue
    } else {
      currentTerm += char
      i++
    }
  }

  if (currentTerm.trim()) {
    terms.push({ type: 'text', value: currentTerm.trim() })
  }

  return terms
}

const parseFilterTerm = (type, value, raw) => {
  switch (type) {
    case 'artist':
    case 'label':
    case 'release':
    case 'track':
    case 'genre': {
      if (type === 'track' && value.startsWith('~')) {
        const idValue = value.slice(1)
        const id = parseInt(idValue, 10)
        if (!isNaN(id) && String(id) === idValue) return { type, value: raw, id, similar: true }
      }
      const id = parseInt(value, 10)
      if (!isNaN(id) && String(id) === value) return { type, value: raw, id }
      break
    }
    case 'bpm': {
      const rangeMatch = value.match(/^(\d+)-(\d+)$/)
      if (rangeMatch) return { type: 'bpm', value: raw, min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) }
      const fuzzyMatch = value.match(/^~(\d+(?:\.\d+)?)$/)
      if (fuzzyMatch) return { type: 'bpm', value: raw, fuzzy: true, bpm: parseFloat(fuzzyMatch[1]) }
      const exactMatch = value.match(/^\d+(?:\.\d+)?$/)
      if (exactMatch) return { type: 'bpm', value: raw, bpm: parseFloat(value) }
      break
    }
    case 'key': {
      const compatible = value.startsWith('~')
      const keyValue = compatible ? value.slice(1) : value
      if (keyValue) return { type: 'key', value: raw, key: keyValue, compatible }
      break
    }
  }
  return { type: 'text', value: raw }
}

export const parseSingleTerm = (raw) => {
  const colonIdx = raw.indexOf(':')
  if (colonIdx <= 0) return { type: 'text', value: raw }
  const type = raw.slice(0, colonIdx).toLowerCase()
  const value = raw.slice(colonIdx + 1)
  return parseFilterTerm(type, value, raw)
}

export const parseSearchTerms = (searchString) => {
  if (!searchString) {
    return []
  }

  const terms = []
  const filterPattern = /(\S+:\S+)/g
  let lastIndex = 0
  let match

  while ((match = filterPattern.exec(searchString)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = searchString.substring(lastIndex, match.index)
      terms.push(...splitTextByWhitespace(textBefore))
    }
    terms.push(parseSingleTerm(match[0]))
    lastIndex = match.index + match[0].length
  }

  const remainingText = searchString.substring(lastIndex)
  terms.push(...splitTextByWhitespace(remainingText))
  return terms
}

export const searchTermsToString = (searchTerms, preserveTrailingSpace = false) => {
  if (!searchTerms || searchTerms.length === 0) {
    return ''
  }

  const result = searchTerms
    .map((term) => {
      const value = term.value
      if (term.type === 'text' && /\s/.test(value)) {
        return `"${value}"`
      }
      return value
    })
    .join(' ')

  return preserveTrailingSpace ? result : result.trim()
}

export const searchTermsToQueryString = (searchTerms) => {
  return searchTermsToString(searchTerms)
}

export const hasEntityTerm = (searchTerms, entityType, entityId) => {
  return searchTerms.some((term) => term.type === entityType && term.id === entityId)
}

export const addEntityTerm = (searchTerms, entityType, entityId, entityName = undefined) => {
  if (hasEntityTerm(searchTerms, entityType, entityId)) {
    return searchTerms
  }

  const entityTerm = {
    type: entityType,
    value: `${entityType}:${entityId}`,
    id: entityId,
    ...(entityName ? { name: entityName } : {}),
  }

  const textTerms = searchTerms.filter((term) => term.type === 'text')
  const entityTerms = searchTerms.filter((term) => term.type !== 'text')
  return [...entityTerms, entityTerm, ...textTerms]
}

export const removeEntityTerm = (searchTerms, entityType, entityId) => {
  return searchTerms.filter((term) => !(term.type === entityType && term.id === entityId))
}

export const updateTextTerms = (searchTerms, textValue) => {
  const entityTerms = searchTerms.filter((term) => term.type !== 'text')
  const textTerms = splitTextByWhitespace(textValue)
  return [...entityTerms, ...textTerms]
}

export const getTextValueFromTerms = (searchTerms, preserveTrailingSpace = false) => {
  if (!searchTerms || searchTerms.length === 0) {
    return ''
  }
  const result = searchTerms.map((term) => term.value).join(' ')
  return preserveTrailingSpace ? result : result
}

/**
 * Encode entity term display names into a URL parameter string.
 * Format: "artist:42=Some Artist,label:100=Some Label"
 * Only entity terms with a known name are included.
 */
export const entityNamesToUrlParam = (searchTerms) => {
  const namedEntityTerms = searchTerms.filter((t) => t.type !== 'text' && t.name)
  if (namedEntityTerms.length === 0) return ''
  return namedEntityTerms.map((t) => `${t.value}=${encodeURIComponent(t.name)}`).join(',')
}

/**
 * Merge display names from a `names` URL parameter back into parsed search terms.
 * namesParam format: "artist:42=Some Artist,label:100=Some Label"
 */
export const applyEntityNamesFromUrlParam = (searchTerms, namesParam) => {
  if (!namesParam) return searchTerms
  const nameMap = {}
  namesParam.split(',').forEach((entry) => {
    const eqIdx = entry.indexOf('=')
    if (eqIdx > 0) {
      nameMap[entry.slice(0, eqIdx)] = decodeURIComponent(entry.slice(eqIdx + 1))
    }
  })
  return searchTerms.map((term) => {
    if (term.type !== 'text' && nameMap[term.value]) {
      return { ...term, name: nameMap[term.value] }
    }
    return term
  })
}
