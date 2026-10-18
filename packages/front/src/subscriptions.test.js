import { entitySubscriptionText, groupSubscriptions, isSubscribed } from './subscriptions'

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
