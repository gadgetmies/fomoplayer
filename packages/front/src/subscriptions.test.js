import { entitySubscriptionText, groupSubscriptions, isSubscribed, visibleSubscriptions } from './subscriptions'

const notifications = [
  { text: 'artist:12', displayName: 'Noisia', storeName: 'Beatport' },
  { text: 'artist:12', displayName: 'Noisia', storeName: 'Bandcamp' },
  { text: 'label:3', displayName: 'Vision', storeName: 'Beatport' },
  { text: 'genre:dnb', displayName: 'genre:dnb', storeName: 'Beatport' },
]

describe('groupSubscriptions', () => {
  it('groups by kind and merges stores per text', () => {
    const groups = groupSubscriptions(notifications)
    expect(groups.artists).toEqual([{ text: 'artist:12', displayName: 'Noisia', storeNames: ['Beatport', 'Bandcamp'] }])
    expect(groups.labels.map(({ displayName }) => displayName)).toEqual(['Vision'])
    expect(groups.searches.map(({ text }) => text)).toEqual(['genre:dnb'])
  })
})

describe('isSubscribed', () => {
  it('matches the text and store case-insensitively', () => {
    expect(isSubscribed(notifications, entitySubscriptionText('artist', 12), 'beatport')).toBe(true)
    expect(isSubscribed(notifications, entitySubscriptionText('label', 3), 'Bandcamp')).toBe(false)
  })
})

describe('visibleSubscriptions', () => {
  const items = Array.from({ length: 15 }, (_, i) => ({ text: `artist:${i}`, displayName: `Artist ${i}` }))

  it('shows the first ones until expanded', () => {
    const collapsed = visibleSubscriptions(items, { limit: 12 })
    expect(collapsed.shown).toHaveLength(12)
    expect(collapsed.canExpand).toBe(true)
    expect(visibleSubscriptions(items, { limit: 12, expanded: true }).shown).toHaveLength(15)
  })

  it('does not offer expanding a short group', () => {
    expect(visibleSubscriptions(items.slice(0, 3), { limit: 12 }).canExpand).toBe(false)
  })

  it('shows every match of a filter, by name and ignoring case', () => {
    const filtered = visibleSubscriptions(items, { limit: 2, filter: ' artist 1' })
    expect(filtered.shown.map(({ displayName }) => displayName)).toEqual([
      'Artist 1',
      'Artist 10',
      'Artist 11',
      'Artist 12',
      'Artist 13',
      'Artist 14',
    ])
    expect(filtered).toMatchObject({ matchingCount: 6, totalCount: 15, canExpand: false })
  })
})
