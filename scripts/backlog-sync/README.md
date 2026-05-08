# backlog-sync

Two-way sync between the in-repo backlog (`backlog/tasks/`,
`backlog/stories/`, `backlog/epics/` plus status symlinks) and the GitHub
Project at <https://github.com/users/gadgetmies/projects/2>.

## When to use it

- After a session of editing the filesystem backlog (renaming
  symlinks, writing new task READMEs, marking things done) — run
  `npm run backlog:sync` to push your changes up to the GitHub Project.
- After updating items on the GitHub Project (changing status,
  editing issue titles/bodies, adding new issues) — run the same
  command to pull those changes into the filesystem.
- The script detects changes on both sides; you don't have to remember
  which way to sync.

## Subcommands

```sh
npm run backlog:sync:status         # dry-run preview (no changes applied)
npm run backlog:sync                # incremental sync (default)
npm run backlog:sync:init           # first-time bidirectional sync
                                    #   (use only if .sync-state.json
                                    #    doesn't exist yet)
```

Direct invocation also works:

```sh
node scripts/backlog-sync sync          # dry-run
node scripts/backlog-sync sync --apply  # actually apply
node scripts/backlog-sync init --apply  # first-time sync
node scripts/backlog-sync init --apply --resume  # continue after partial run
```

## Conflict resolution

When an item has changed on **both** sides since the last sync, the
script prompts for resolution per-item:

```
─────────────────────────────────────────────────────────────────
CONFLICT: 030 Recently added CTE missing ORDER BY
Both sides changed since last sync.
─────────────────────────────────────────────────────────────────
field        FILESYSTEM                    GITHUB
title        Recently added CTE… *         Recently added CTE — fix *
status       in-progress                   To be verified *
priority     am-                           am-
effort       S                             M *
body         [hash 4f2a1b9c]               [hash 0c812e35] *
─────────────────────────────────────────────────────────────────
[A] FS wins (push FS values to GH)
[B] GH wins (pull GH values to FS)
[S] Skip (leave both sides as-is, do not update sync state)
[Q] Quit (apply nothing further this run)
```

`*` marks fields that changed since last sync. Resolution is
per-**item**, not per-field — picking `A` adopts the entire FS-side
state for this item; `B` adopts the entire GH-side state.

## Mapping reference

### Status

| Filesystem folder       | GitHub Project status              | GitHub issue state |
|-------------------------|------------------------------------|--------------------|
| `todo/`                 | Backlog                            | open               |
| `not-prioritized/`      | Not prioritized                    | open               |
| `in-progress/`          | In progress                        | open               |
| `blocked/`              | Blocked (added on demand)          | open               |
| `to-be-verified/`       | To be verified                     | open               |
| `validated/`            | Validated                          | open               |
| `in-production/`        | In production / to be monitored    | open               |
| `done/`                 | (none — closed item)               | closed (completed) |
| `dropped/`              | (none — closed item)               | closed (not_planned) |

### Custom fields on the Project

- **Backlog ID** (text): the 3-digit filesystem ID. Set automatically;
  used to match items between the two sides on subsequent syncs.
- **Priority** (text): the lexicographic prefix from the FS symlink
  name (e.g. `am-`, `b-`, `bm-`).
- **Effort** (single-select): S / M / L / XL, mirrors the
  frontmatter `effort` field.

## State file

`backlog/.sync-state.json` records the last-synced state of each item
(title, body hash, status, priority, effort) on both sides plus the
mapping between filesystem ID and GitHub Issue / Project Item ID.
Commit it after each sync run.

## What the script does NOT do

- **`notes.md` is filesystem-only.** Working notebooks aren't synced
  (high write frequency, low value to mirror).
- **No automatic story/epic hierarchy.** Stories and epics still
  contain symlinks to member tasks on the FS side; on the GitHub side
  they're separate Issues. The Project's "Parent issue" field is left
  unset by the sync — set it in the GitHub UI if you want sub-issue
  relationships visible there. Future enhancement.
- **No deletion.** If a task folder disappears, the script warns and
  skips. Close the corresponding issue on GitHub yourself if you mean
  to retire it.
- **No conflict on `Backlog ID` field.** Once set on the GH side it's
  the canonical link; manual edits to it will break the matching.

## Implementation notes

- Pure Node (no third-party deps); shells out to `gh` for GitHub
  authentication and GraphQL. Run `gh auth login` first.
- The token must have the `project` scope:
  `gh auth refresh -s project`.
- Issue body has a footer added by the sync (`<!-- backlog-sync:footer -->`)
  pointing at the FS path; the footer is stripped before hashing for
  change detection, so editing it doesn't trigger spurious conflicts.
- `init` saves state every 5 items so a partial run is recoverable
  via `--resume`.
