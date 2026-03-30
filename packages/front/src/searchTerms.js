export const parseSearchTerms = (searchString) => {
  if (!searchString) {
    return []
  }

  const terms = []
  const entityPattern = /(artist|label|release|track):(\d+)/gi
  let lastIndex = 0
  let match

  while ((match = entityPattern.exec(searchString)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = searchString.substring(lastIndex, match.index)
      const textTerms = splitTextByWhitespace(textBefore)
      terms.push(...textTerms)
    }

    const entityType = match[1].toLowerCase()
    const entityId = parseInt(match[2], 10)
    terms.push({ type: entityType, value: `${entityType}:${entityId}`, id: entityId })

    lastIndex = match.index + match[0].length
  }

  const remainingText = searchString.substring(lastIndex)
  const textTerms = splitTextByWhitespace(remainingText)
  terms.push(...textTerms)

  return terms
}

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
