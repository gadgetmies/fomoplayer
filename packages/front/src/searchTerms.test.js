import {
  parseSearchTerms,
  searchTermsToQueryString,
  findCartSearchTerm,
  entityNamesToUrlParam,
  applyEntityNamesFromUrlParam,
  parseEntityInput,
  parseSingleTerm,
  searchTermsToString,
} from './searchTerms'

const uuid = '12d9db39-606d-4753-8b90-e30385d43a09'

describe('cart similarity search term', () => {
  it('parses cart:~<uuid> into a cart term', () => {
    const [term] = parseSearchTerms(`cart:~${uuid}`)
    expect(term).toEqual({ type: 'cart', value: `cart:~${uuid}`, id: uuid, similar: true })
  })

  it('serialises the cart term back to the query string', () => {
    expect(searchTermsToQueryString(parseSearchTerms(`cart:~${uuid}`))).toBe(`cart:~${uuid}`)
  })

  it('treats a cart term without a valid uuid as text', () => {
    expect(parseSearchTerms('cart:~not-a-uuid')[0].type).toBe('text')
  })

  it('finds the cart term among other terms', () => {
    expect(findCartSearchTerm(parseSearchTerms(`techno cart:~${uuid}`))?.id).toBe(uuid)
    expect(findCartSearchTerm(parseSearchTerms('techno'))).toBeUndefined()
  })

  it('round-trips the cart name through the names URL parameter', () => {
    const terms = [{ ...parseSearchTerms(`cart:~${uuid}`)[0], name: 'Bass House' }]
    const names = entityNamesToUrlParam(terms)
    expect(applyEntityNamesFromUrlParam(parseSearchTerms(`cart:~${uuid}`), names)[0].name).toBe('Bass House')
  })
})

describe('entity lookup input', () => {
  it('keeps the spaces of a name of several words', () => {
    expect(parseEntityInput('label:Vision Recordings ')).toEqual({
      prefix: 'label',
      similar: false,
      text: 'Vision Recordings',
      isId: false,
    })
  })

  it('drops the quotes around a name, closed or not', () => {
    expect(parseEntityInput('label:"Vision Recordings"').text).toBe('Vision Recordings')
    expect(parseEntityInput('label:"Vision Rec').text).toBe('Vision Rec')
  })

  it('reads a number as an id unless it is quoted', () => {
    expect(parseEntityInput('artist:808').isId).toBe(true)
    expect(parseEntityInput('artist:"808"').isId).toBe(false)
  })

  it('is not a lookup without a name or for a prefix that is not searched', () => {
    expect(parseEntityInput('artist:')).toBeNull()
    expect(parseEntityInput('artist:"')).toBeNull()
    expect(parseEntityInput('release:Concussion', ['artist', 'label'])).toBeNull()
    expect(parseEntityInput('techno')).toBeNull()
  })

  it('keeps the similar marker of a track lookup', () => {
    expect(parseEntityInput('track:~The Tide')).toMatchObject({ prefix: 'track', similar: true, text: 'The Tide' })
  })
})

describe('quoted entity term', () => {
  it('is a name without its quotes, also when it is a number', () => {
    expect(parseSingleTerm('label:"Vision Recordings"')).toMatchObject({ type: 'label', name: 'Vision Recordings' })
    expect(parseSingleTerm('artist:"808"')).toMatchObject({ type: 'artist', name: '808' })
    expect(parseSingleTerm('artist:"808"').id).toBeUndefined()
  })

  it('serialises back with one pair of quotes', () => {
    expect(searchTermsToString([parseSingleTerm('label:"Vision Recordings"')])).toBe('label:"Vision Recordings"')
  })
})
