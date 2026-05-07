---
id: 038
title: "\"Search by name or URL to follow\" field doesn't trigger backend requests"
effort: S
created: 2026-05-07
---

# "Search by name or URL to follow" field doesn't trigger backend requests

## Why

Reported on PR preview environments: typing into the **Settings → Following
→ Search by name or URL to follow** field does not produce any network
requests against the backend, so no follow candidates ever appear. The
spinner / "No results found" / suggestion list states never resolve from
the user's input.

The handler is supposed to fan out per configured store
(`/stores/<storeName>/search/?q=…`) for plain-text queries, or call
`/followDetails?q=…` for URL queries, after a 500 ms debounce. Neither
fires in the broken state.

## Reproduction

1. Open a PR preview deployment, log in.
2. Navigate to Settings → Following.
3. Type a few characters into "Search by name or URL to follow".
4. **Observed:** no network requests in DevTools; the suggestions panel
   never updates; "Searching" spinner never appears.
5. **Expected:** after 500 ms of inactivity, one network request per
   configured store (or a single `/followDetails` request for URLs), and
   the suggestion list rendered from the responses.

Reporter notes the bug "at least in the preview environments" — verify
whether main / production are also affected before scoping the fix.

## What

- Identify why the debounced fetch does not run in PR previews.
- Fix it so typing a query reliably produces backend requests after the
  debounce, in every environment.
- Add a regression-resistant test (component test or integration) that
  exercises the input and asserts the requests fire.

## Acceptance criteria

- [ ] Typing a name into the field triggers one
      `/stores/<storeName>/search/?q=…` request per store after the
      500 ms debounce settles, on PR preview, local dev, and production.
- [ ] Typing a URL (`https://…`) triggers a single `/followDetails?q=…`
      request after the same debounce.
- [ ] The fix is exercised by an automated test so this regresses loudly
      next time.
- [ ] Production (and any other still-working environment) keeps working
      — verify before merging.

## Code pointers

- `packages/front/src/Settings.js:597` — the `<SearchBar>` for the follow
  search and its inline `onChange` handler. Setting up the debounce,
  resolving URL vs. name, and calling `requestWithCredentials`.
- `packages/front/src/Settings.js:643` — the per-store fan-out: maps over
  `this.props.stores` and fires one request per store. Empty `stores`
  prop ⇒ zero requests.
- `packages/front/src/App.js` — where `this.props.stores` is sourced and
  passed into `<Settings>`. Confirm the stores list is populated in PR
  preview mode (some preview-env code paths empty the store list — see
  `request-json-with-credentials.js:5` `resolveStoresForRequest` which
  treats `isPreviewEnv` specially).
- `packages/front/src/request-json-with-credentials.js:32` —
  `requestWithCredentials` builds the URL and adds `?store=…` from the
  resolved stores. Worth verifying it isn't throwing synchronously
  against an unset `config.apiURL` or producing a malformed URL in
  preview env.

## Open questions

- Is `this.props.stores` empty in preview environments at the time
  Settings → Following is rendered? If so, the per-store `.map` produces
  no promises and no requests fire — that matches the symptom.
- Does the URL branch (`/followDetails?q=…`) fail in the same way, or
  only the name branch? If only the name branch, the stores-empty
  hypothesis is likely the cause.
- Is `config.apiURL` set correctly in PR preview builds, or is the URL
  resolving to something the browser won't dispatch
  (e.g. unset → relative empty URL)?

## Out of scope

- Redesigning the follow search UX or replacing `SearchBar`.
- Changing the backend `/followDetails` or `/stores/.../search/` shape.
