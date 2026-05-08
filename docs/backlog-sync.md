# Backlog ↔ GitHub Project sync

The in-repo backlog at `backlog/` and the GitHub Project at
<https://github.com/users/gadgetmies/projects/2> ("Main") are kept in
sync by a script at `scripts/backlog-sync/`. This document explains
what is mirrored, the direction conventions, and how to handle
conflicts.

## Why both?

The filesystem backlog is optimised for **AI-agent pickup**: every
task is one folder containing the brief (`README.md`), working notes
(`notes.md`), and symlinks for status. An agent reading
`backlog/in-progress/<name>/` has everything it needs to start work.

The GitHub Project is optimised for **human dashboards and
stakeholder visibility**: a board view, saved filters, status
columns, automation hooks, sub-issue rollups. It is the surface a
collaborator who isn't running the repo locally would use.

The sync script keeps them in sync so neither view goes stale and
neither has to be the source of truth alone.

## Quick reference

```sh
npm run backlog:sync:status   # preview what would change
npm run backlog:sync          # apply (default direction = both ways)
```

Both commands check the timestamps and field values on each side
since the last successful sync (recorded in `backlog/.sync-state.json`)
and propagate one-side changes automatically. Both-side changes
prompt for per-item resolution.

## What gets mirrored

| Backlog                         | GitHub Project                                |
|---------------------------------|-----------------------------------------------|
| `tasks/<id>-<slug>/README.md` body | Issue body                                 |
| Frontmatter `title`             | Issue title (prefixed with the backlog ID)    |
| Frontmatter `effort`            | "Effort" custom field (S/M/L/XL single-select) |
| Status folder location          | "Status" custom field + open/closed state     |
| Symlink prefix (priority)       | "Priority" custom field (text)                |
| Backlog ID (3-digit)            | "Backlog ID" custom field (text, the link)    |

What is **not** mirrored:

- `notes.md`: filesystem-only. Working notebook with high edit
  frequency; mirroring would burn API budget for low value.
- `depends-on/` symlinks: filesystem-only currently. Future
  enhancement to mirror as GitHub issue task-list cross-references.
- Stories/epics hierarchy as native GitHub sub-issues: filesystem
  uses symlinks (`stories/<id>/<task-symlink>`); the GitHub side
  treats stories and tasks as separate issues. Set "Parent issue"
  manually in the GitHub UI if needed.

## Status mapping

| Filesystem folder      | GitHub Project status              | Issue state          |
|------------------------|------------------------------------|----------------------|
| `todo`                 | Backlog                            | open                 |
| `not-prioritized`      | Not prioritized                    | open                 |
| `in-progress`          | In progress                        | open                 |
| `blocked`              | Blocked (added on demand)          | open                 |
| `to-be-verified`       | To be verified                     | open                 |
| `validated`            | Validated                          | open                 |
| `in-production`        | In production / to be monitored    | open                 |
| `done`                 | —                                  | closed (completed)   |
| `dropped`              | —                                  | closed (not_planned) |

Items in `done` and `dropped` show as closed Issues on GitHub. The
Project filters by issue state so they can still appear in a "Done"
view.

## Conflict resolution

When the script detects that a single item has changed on **both**
sides since the last sync, it prompts:

```
[A] FS wins   (apply filesystem values to GitHub)
[B] GH wins   (apply GitHub values to filesystem)
[S] Skip      (leave both sides as-is, do not update sync state)
[Q] Quit      (stop the run; apply nothing further)
```

Resolution is per-**item**, not per-field. Picking `A` adopts the
entire filesystem-side state for that item (title, body, status,
priority, effort) and overwrites the GitHub side. The motivation:
field-level merges produce in-between states that often satisfy
neither sender; choosing the whole side preserves consistency.

`Skip` is for "I want to come back to this manually" — the sync
state is **not** updated for skipped items, so the next sync will see
the same conflict again. `Quit` exits the loop entirely; the sync
state captures only what's already been resolved.

## Operational notes

- Run `gh auth refresh -s project` before the first use; the default
  token scopes don't include Project access.
- Commit `backlog/.sync-state.json` after each sync run. It is the
  ground truth for what was last synced.
- The script is idempotent: re-running with no changes is a no-op
  beyond updating `lastSync`.
- `init` is for the first-ever run only. After that, always use
  `sync`.
- If a partial `init` is interrupted, re-run with
  `npm run backlog:sync:init -- --apply --yes --resume`.
