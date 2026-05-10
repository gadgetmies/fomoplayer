---
id: 225
title: Opt-in custom-domain releases for Bandcamp feed sync
effort: M
created: 2026-05-10
---

# Opt-in custom-domain releases for Bandcamp feed sync

## Why

The Bandcamp feed-sync flow (item 025) currently drops releases whose
`item_url` host is on a custom artist domain (e.g. `shallnotfade.co.uk`)
because the manifest only declares `https://*.bandcamp.com/*` and
`browser.scripting.executeScript` rejects with *"Extension manifest must
request permission to access this host"* on any other origin. Adding
`<all_urls>` at install time would be a hard sell — the extension would
appear to demand sweeping access on every install — but Manifest V3 has
a less invasive path: declare those origins as
`optional_host_permissions` and request them at runtime, per host, when
the user explicitly opts in.

Implementing this means a user with followed artists on custom domains
(common with established labels) can, with one prompt per domain, get
the same coverage they get from `*.bandcamp.com` artists.

## What

- Add `optional_host_permissions: ["<all_urls>"]` (or, if it ends up
  workable, an enumerated list of confirmed Bandcamp custom domains) to
  `packages/browser-extension/src/manifest.base.json`. The default
  install-time permission set MUST stay as it is today — this is purely
  *opt-in* additive.
- During a feed sync, the worker already collects dropped custom-domain
  releases (per item 025's `partitionBandcampHosted` filter). Surface
  them to the popup as a structured payload: list of unique hosts plus
  the count of releases per host that were skipped this run.
- Render a one-shot affordance in the popup: a list of dropped hosts
  with three buttons:
  - **"Allow"** per host — calls
    `browser.permissions.request({ origins: ["https://<host>/*"] })`.
    On user accept, retry the dropped releases for that host through
    the existing per-release tab-scrape path; on user decline, leave
    the host in the "skipped" state until the next sync run brings
    them up again.
  - **"Allow all"** — single button that calls
    `browser.permissions.request({ origins: <one origin per dropped host> })`
    in one combined prompt and retries every dropped release on accept.
  - **"Ignore all"** — explicitly tells the worker to skip every
    custom-domain release for the rest of this run AND remember the
    decision (per session, or persisted to `browser.storage.local` —
    see open questions). The user MUST be able to opt back in later via
    a settings or popup affordance, otherwise this becomes a one-way
    trap.
- Granted permissions persist across syncs — once a user has allowed
  `shallnotfade.co.uk`, future runs ingest its releases automatically
  without re-prompting.
- The flow MUST gracefully handle:
  - A permission grant followed by a Bandcamp page that no longer
    matches the expected `TralbumData` shape (treat as a normal scrape
    failure for that release; do not revoke the permission).
  - A user denying a per-host permission (skip for this run, do not
    keep nagging within the same session).
  - Loss of network / timeout on the retried tab scrape (same error
    surface the existing per-release path uses).

## Acceptance criteria

- [ ] The manifest declares `optional_host_permissions` such that
      install-time prompts are unchanged from today.
- [ ] After a sync that drops at least one custom-domain release, the
      popup shows the list of dropped hosts with **Allow per host**,
      **Allow all**, and **Ignore all** controls.
- [ ] Clicking **Allow** for a host triggers the browser's permission
      prompt; on grant, the previously-dropped releases for that host
      are scraped and ingested without requiring a new sync run.
- [ ] Clicking **Allow all** triggers a single combined permission
      prompt covering every dropped host this run.
- [ ] Clicking **Ignore all** dismisses the affordance for the rest of
      the current sync session and does not re-show until the *next*
      sync surfaces a new (not-already-ignored) custom-domain host.
- [ ] Once a host's permission is granted, subsequent feed syncs ingest
      its releases automatically with no prompt.
- [ ] The settings UI (or a "manage access" affordance somewhere
      reachable) lets the user revoke a previously-granted host or
      undo a previous "ignore all" decision.

## Code pointers

- `packages/browser-extension/src/js/content/bandcamp/feed-parse.js`
  — `partitionBandcampHosted` already separates kept from dropped.
  Extend it (or a sibling helper) to return per-host counts so the
  popup can render the prompt.
- `packages/browser-extension/src/js/service_worker.js` —
  `scrapeFeedFromWorker` currently emits a `console.warn` per source
  with the dropped count. Replace / supplement that with a structured
  message to the popup containing the per-host summary; add a retry
  path triggered by `bandcamp:permissions-granted` (or similar)
  messages.
- `packages/browser-extension/src/manifest.base.json` —
  `optional_host_permissions` declaration.
- `packages/browser-extension/src/js/popup/...` (or wherever the
  Bandcamp feed-sync controls live) — render the per-host opt-in UI.

## Out of scope

- Adding non-Bandcamp third-party stores to the feed-sync flow.
- Auto-detecting "custom Bandcamp domains" without scraping —
  Bandcamp tells us the host directly via `item_url`, no detection
  needed.
- Pre-granting `<all_urls>` at install time. Explicit opt-in is the
  whole point of this change.

## Open questions

- Should the **Ignore all** decision be session-only or persisted to
  `browser.storage.local`? Persisted is friendlier (no nag between
  syncs) but requires a clear "undo" path. Session-only is simpler.
  Default proposal: persisted, with a "show ignored hosts" affordance
  in the popup or settings.
- Per-host vs per-domain permission scoping: do we request
  `https://shallnotfade.co.uk/*` (origin scope) or also
  `https://*.shallnotfade.co.uk/*` (subdomain scope)? Bandcamp custom
  domains are typically a single host without subdomains, so origin
  scope is likely enough. Confirm against a few real examples before
  shipping.
- Behaviour when a single sync run produces 30+ dropped hosts (long
  tail of small labels). The popup affordance should remain usable —
  consider grouping or "show more" rather than a 30-row list.

## Depends on

- Item 025 (`bandcamp-feed-include-followed-artist-releases`) — provides
  the `partitionBandcampHosted` filter and the worker's dropped-release
  reporting hook this item builds on.
