## Context

The popup's `Root` component (`packages/browser-extension/src/js/popup/Root.jsx`)
maintains a list of host-specific panels:

```js
const panels = [
  { matcher: new RegExp(`^${resolvedAppUrl}`), component: MultiStorePlayerPanel },
  { storeName: 'beatport', matcher: /^https:\/\/.*\.beatport\.com/, component: BeatportPanel },
  { storeName: 'bandcamp', matcher: /^https:\/\/.*\.?bandcamp\.com/, component: BandcampPanel },
]
```

At render, it filters by `enabledStores`, picks a `current` panel from the
active tab's hostname, and renders `[current, …rest]` — i.e. the currently
relevant panel is always first, but the *set* of panels rendered after it
depends on which one is current. That reorder is exactly the case where
React needs stable keys to keep panel state alive.

Two facts constrain the design:

1. The `MultiStorePlayerPanel` entry has **no** `storeName`. The filter
   logic at lines 102-105 already tolerates that (`R.path(['enabledStores',
   undefined], state)` returns `undefined`, which falls through to
   "enabled"), so the absence is deliberate, not a bug.
2. The extension build uses webpack with default minification. We don't
   pin `keep_classnames`, so `Component.name` is not a stable identity
   across builds and **must not** be used as a React key.

## Goals / Non-Goals

**Goals:**

- Every panel in the rendered list has a unique, stable React key derived
  from the panel's definition — not from its index, not from its
  component class name.
- Panel local state (e.g. a half-typed cart name in `BandcampPanel`'s
  dropdown) survives a reorder of `enabledPanels` triggered by the
  active tab changing.
- The console no longer emits the "Each child in a list should have a
  unique key prop" warning when the popup opens.

**Non-Goals:**

- Refactoring `Root` to functional components / hooks. The class
  component stays.
- Changing the panel filter / order logic at `Root.jsx:102-109`.
- Adding browser-level UI tests for popup rendering. That is its own
  backlog item (`m-208-implement-ui-tests` / `wc-189-implement-unit-tests`).

## Decisions

### Decision 1: Source of the React key

**Chosen:** Give the `MultiStorePlayerPanel` entry an explicit
`storeName: 'fomoplayer'` and key off `component.storeName` in the
`.map`. The expression becomes `React.createElement(component.component,
{ key: component.storeName, isCurrent: …, …panelProps })`.

**Why this:**

- One source of identity. `storeName` is already how panels are
  identified in `enabledStores` lookups; making it also the React key
  keeps things singular.
- Safe with the existing filter. `enabledStores.fomoplayer` is
  undefined, and the filter at lines 102-105 returns "enabled" for any
  `undefined` lookup, so the FomoPlayer panel stays visible exactly as
  it does today.
- No coupling to bundler behaviour (unlike `Component.name`).
- Minimal diff: one new field on one panel entry + one `key:` in the
  `.map` body.

**Alternatives considered:**

- **Use `Component.name` / `displayName` as the key.** Rejected:
  webpack's default minifier (terser) renames classes, so the key
  identity would silently shift between dev and prod builds. We could
  pin `keep_classnames`, but that's a bundler-wide setting changed for
  one render call — too much blast radius.
- **Introduce a separate `key` field on each panel definition.**
  Rejected as redundant: the value would be identical to `storeName`
  for `beatport`/`bandcamp` and a synthetic literal for the FomoPlayer
  panel — i.e. exactly the same shape as just giving the FomoPlayer
  panel a `storeName`, but with two fields to keep in sync.
- **Use a `?? 'fomoplayer'` fallback in the `.map` body.** Rejected as
  less honest: it puts the FomoPlayer panel's identity in the render
  site, not in its definition. Future readers would have to chase the
  fallback to understand which panel is which.

### Decision 2: Where `key` lives in the `React.createElement` call

**Chosen:** Pass `key` as a property of the props object, i.e.
`React.createElement(C, { key: …, isCurrent, ...panelProps })`.

`React.createElement` extracts `key` (and `ref`) from props before
forwarding the rest to the component, so this is the canonical pattern
and matches the warning's expected fix.

### Decision 3: Naming the FomoPlayer panel's storeName

**Chosen:** `'fomoplayer'`. Matches the product name used elsewhere
(`DEFAULT_APP_URL`, the extension's user-facing copy). Avoids
`'multi_store_player'` (the legacy internal name that we have been
moving away from) and avoids `null` / empty-string sentinels.

## Risks / Trade-offs

- **[Risk]** Some other code path reads `panel.storeName` and assumes
  it is one of `'beatport' | 'bandcamp' | undefined`. → Mitigation:
  the only reader inside the extension is the filter at
  `Root.jsx:102-105`, which uses `storeName` as an `enabledStores`
  lookup key — already shown safe above. A repo-wide grep for
  `panel.storeName` / `storeName: 'fomoplayer'` will catch any future
  reader during review.
- **[Risk]** A second `.map(...)` is later added to the popup tree
  without a key. → Mitigation: the audit pass listed in `tasks.md`
  walks the popup tree once at implementation time; this change does
  not install a lint rule, so future regressions are not prevented
  structurally. That's an acceptable trade-off for the size of this
  fix — adding ESLint's `react/jsx-key` to the extension's lint config
  is a separate, larger change.
- **[Trade-off]** Introducing a "storeName" that doesn't correspond to
  an actual store is a minor concept stretch. The alternative
  (a parallel `key` field) was rejected as more code for the same
  semantic; this design accepts the small impurity.
