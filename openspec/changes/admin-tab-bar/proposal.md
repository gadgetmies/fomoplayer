## Why

The admin area is hub-and-spoke: the Radiator page at `/admin` holds a row of
buttons to the other tools (Jobs, Duplicates, Mislabeled, Artist split), and
each tool only has a "Back to Radiator" button. Going from one tool to another
takes two clicks through the Radiator page, and nothing shows which admin page
is open.

## What Changes

- Every admin page shows the same tab bar at the top: Radiator, Jobs,
  Duplicates, Mislabeled, Artist split. The current page's tab is highlighted
  and each tab links straight to its page.
- The tab bar replaces the Radiator page's row of tool buttons and every
  "Back to Radiator" button.
- The bar follows the Notifications page's tab bar: the `select-button` tab
  row in a sticky bar with `--top-bar-background-color`.

## Capabilities

### New Capabilities
- `admin-tab-bar`: shared navigation across the admin pages.

### Modified Capabilities

(none)

## Impact

- `packages/front/src/`: new `AdminTabs.js` + `AdminTabs.css`; `Admin.js`,
  `AdminJobs.js`, `AdminDuplicates.js`, `AdminMislabeled.js`,
  `AdminArtistSplit.js` and their CSS.
- Demo tests `admin-tab-bar-local.js` / `admin-tab-bar-preview.js` with shared
  steps, including `casesBeforeChange` that record the old hub-and-spoke navigation.
- No backend changes.
