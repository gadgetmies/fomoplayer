// Search subscriptions grouped the way the Notifications page shows them: one entry per subscription text (a text can
// have several stores), split into searches, artists (`artist:<id>`) and labels (`label:<id>`).
export const groupSubscriptions = (notifications = []) => {
  const byText = new Map()
  for (const { text, displayName, storeName } of notifications) {
    const entry = byText.get(text) ?? { text, displayName: displayName || text, storeNames: [] }
    if (storeName && !entry.storeNames.includes(storeName)) entry.storeNames.push(storeName)
    byText.set(text, entry)
  }
  const groups = { searches: [], artists: [], labels: [] }
  for (const entry of byText.values()) {
    if (/^artist:\d+$/.test(entry.text)) groups.artists.push(entry)
    else if (/^label:\d+$/.test(entry.text)) groups.labels.push(entry)
    else groups.searches.push(entry)
  }
  for (const list of Object.values(groups)) list.sort((a, b) => a.displayName.localeCompare(b.displayName))
  return groups
}

// The subscription text for a followed artist or label.
export const entitySubscriptionText = (type, id) => `${type}:${id}`

export const isSubscribed = (notifications = [], text, storeName) =>
  notifications.some((n) => n.text === text && n.storeName?.toLowerCase() === storeName?.toLowerCase())
