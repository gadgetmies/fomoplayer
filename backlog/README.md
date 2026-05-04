# Backlog

Track upcoming work for this project. Each item lives in its own folder under
`items/`, so the spec, working notes, and any related materials (screenshots,
logs, links) stay together and travel with the item.

## Layout

```
backlog/
├── README.md         # this file
├── INDEX.md          # priority-ordered list — the source of truth for ordering
├── _template/        # copy this to start a new item
└── items/
    └── NNN-slug/
        ├── README.md # what the item is, why, acceptance criteria
        ├── notes.md  # working notes, rejected approaches, open questions
        └── refs/     # screenshots, logs, design exports, linked PRs (optional)
```

## Adding an item

1. `cp -r backlog/_template backlog/items/<NNN>-<slug>` — pick the next free
   number (do not reuse numbers, even for dropped items); slug is short
   kebab-case.
2. Fill in `README.md` (frontmatter + spec).
3. Add a line to `INDEX.md` in the right priority section.

## Working an item

1. Set `status: in-progress` in the item's frontmatter and move the line in
   `INDEX.md` to the **In progress** section.
2. Capture rejected approaches and surprising findings in `notes.md` as you
   go — future sessions will thank you.
3. When done, set `status: done`, move the line in `INDEX.md` to **Done**, and
   keep the folder for history.

## Working with an AI agent

The point of this layout is that a fresh agent session can pick up an item by
reading **one folder**. The principles below keep that working.

- **Self-contained items.** The item folder should have everything needed to
  start: what to build, why, where in the code, what "done" looks like. If the
  agent has to ask "what does X mean here?" the item is underspecified.
- **Stable IDs, mutable priority.** Folder names never change. Priority lives
  only in `INDEX.md`. Reordering is one file edit, not a directory rename.
- **Acceptance criteria up front.** The agent can't tell when it's done if you
  can't either. One or two bullets is fine, but make them testable.
- **Capture rejected approaches.** When the agent tries something that doesn't
  work, write it down in `notes.md`. Different sessions otherwise repeat the
  same mistakes — they have no memory of last week's dead end.
- **Link to code, don't duplicate it.** `packages/back/routes/foo.js:120` ages
  well; pasted snippets rot.
- **Right-size the spec.** A one-line fix doesn't need a novel; a refactor that
  spans many files does. If the spec exceeds roughly half a page of prose, the
  item is probably two items.
- **One item ≈ one PR.** Split when it gets bigger — easier to review, easier
  for the agent to scope context. Sub-task checklists inside an item are fine
  for grouping closely-related work, but watch for the "epic that never lands"
  smell.
- **Refs over inline.** Screenshots, error logs, design exports go in `refs/`.
  Markdown stays readable.
- **Decisions live here, code lives in the repo.** The backlog explains *why*.
  The commit explains *what*. Don't paste diffs into items.
- **Brief the agent on the item, not the whole project.** When starting work,
  point the agent at `backlog/items/<id>-<slug>/` rather than describing the
  task in chat. The folder is the brief.

## Frontmatter fields

```yaml
id: 001                            # zero-padded, matches folder prefix
title: Short summary
status: todo                       # todo | in-progress | blocked | done | dropped
priority: P2                       # P0 ship-blocker · P1 next · P2 normal · P3 nice-to-have
effort: M                          # S · M · L · XL  (rough t-shirt sizing)
created: 2026-05-04
depends-on: []                     # other item ids, e.g. [002, 005]
```

Keep frontmatter and `INDEX.md` in sync. If they ever disagree, `INDEX.md`
wins for ordering and the item's frontmatter wins for state.
