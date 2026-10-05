import {
  parseSearchTerms,
  searchTermsToQueryString,
  findCartSearchTerm,
  entityNamesToUrlParam,
  applyEntityNamesFromUrlParam,
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
