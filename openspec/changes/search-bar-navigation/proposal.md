## Why

The top bar search loses track of itself across navigation:

- Its magnifying glass is hidden whenever the search view is not open and the
  input has no focus, and with focus it is not vertically centred.
- Going back to a search shows its terms only once some later render happens
  (in practice when the search request completes): the app adds search
  entries to the browser history behind the router's back, with an undefined
  state, and the router ignores going back to such an entry. A link to the
  page the router still thinks is open then replaces the search entry.
- Leaving a search drops its artist / label pills but keeps the text pills,
  on every page. Settings gives no way back to the results, and Discover or a
  cart keeps stale text in the bar.

## What Changes

- The magnifying glass always shows and is centred.
- The app changes the URL through the router's history, so back / forward to
  a search updates the view and the bar at once, before the results arrive.
- Discover, the carts and Notifications empty the search bar (entity and
  text terms, typed text too). Other pages (Settings, Admin) keep the search
  and show a "Show results" button in the top bar that runs it again.

## Capabilities

### New Capabilities
- `search-bar-navigation`: the top bar search across navigation.

### Modified Capabilities

(none)

## Impact

- `packages/front/src/App.js` (router-aware URL changes, search bar reset on
  navigation), `TopBar.js` (Show results), `SearchBar.css` (icon).
- Demo tests `search-bar-navigation-local.js` / `-preview.js`.
- No backend changes.
