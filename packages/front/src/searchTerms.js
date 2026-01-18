export const parseSearchTerms = (searchString) => {
  if (!searchString) {
    return []
  }

  const terms = []
  const entityPattern = /(artist|label|release):(\d+)/gi
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
  let currentIndex = 0
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
  return searchTerms.some(
    (term) => term.type === entityType && term.id === entityId,
  )
}

export const addEntityTerm = (searchTerms, entityType, entityId) => {
  if (hasEntityTerm(searchTerms, entityType, entityId)) {
    return searchTerms
  }

  const entityTerm = {
    type: entityType,
    value: `${entityType}:${entityId}`,
    id: entityId,
  }

  const textTerms = searchTerms.filter((term) => term.type === 'text')
  const entityTerms = searchTerms.filter((term) => term.type !== 'text')
  const newEntityTerms = [...entityTerms, entityTerm]

  return [...newEntityTerms, ...textTerms]
}

export const removeEntityTerm = (searchTerms, entityType, entityId) => {
  return searchTerms.filter(
    (term) => !(term.type === entityType && term.id === entityId),
  )
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

