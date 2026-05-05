# Backlog

Track upcoming work for this project. Work is organised in three layers:

- **Tasks** — concrete units of implementation. The bulk of the work lives
  here. Each task has a spec, working notes, and any related materials in
  its own folder under `tasks/`.
- **Stories** — user-facing increments composed of multiple tasks. A story
  exists when a single user-visible change is too big to land as one task
  and needs to be split. Stories are tracking only — implementation lives
  in their tasks.
- **Epics** — multi-story bodies of work, grouped under a shared theme.
  Epics are tracking only — they do not contain implementation work or
  acceptance criteria of their own. An epic is "done" when all its stories
  are.

The prioritised backlog (`todo/`, `in-progress/`, `blocked/`) points at
**stories and standalone tasks**. Tasks that belong to a story are not
prioritised independently — the story's slot is the priority. Epics are
not prioritised; they live solely under `epics/`.

Status and priority are encoded in the filesystem: a symlink under one of
the status folders carries the status, and the symlink name's prefix
carries the priority. There is no INDEX file — the directory listing *is*
the index.

## Layout

```
backlog/
├── README.md            # this file
├── _template/           # task scaffold (copy this to start a new task)
├── tasks/               # implementation work units
│   └── NNN-slug/
│       ├── README.md    # what to build, why, acceptance criteria
│       ├── notes.md     # working notes, rejected approaches, open questions
│       ├── depends-on/  # optional — symlinks to tasks/stories this depends on
│       └── refs/        # optional — screenshots, logs, design exports
├── stories/             # user-facing increments composed of >1 tasks
│   └── NNN-slug/
│       ├── README.md    # the user-facing change, why, "done" criteria
│       └── …            # symlinks to member tasks under tasks/
├── epics/               # multi-story bodies of work — tracking only
│   └── <slug>/
│       ├── README.md    # the wider goal, why
│       └── …            # symlinks to member stories under stories/
├── todo/                # priority-ordered symlinks (fractional-indexed)
├── in-progress/         # active work
├── blocked/             # waiting on something external
├── done/                # archive of completed stories and tasks
└── dropped/             # archive of stories and tasks that won't be done
```

`tasks/` and `stories/` share one numeric id space — every task or story
gets the next free `NNN`. Folder context (`tasks/NNN-…` vs `stories/NNN-…`)
disambiguates. Epics use slugs only; they don't take an id.

## Status

The status folder a symlink lives in is the source of truth. To change
status, move the symlink:

```sh
mv backlog/todo/f-003-bandcamp-cover-controls-override \
   backlog/in-progress/f-003-bandcamp-cover-controls-override
```

The underlying folder (in `tasks/` or `stories/`) does not move and is
never renamed.

A story is done when all its member tasks are in `done/`. Move the story's
own symlink to `done/` at that point — it doesn't happen automatically.

## Priority — fractional indexing

Symlinks under `todo/`, `in-progress/`, and `blocked/` carry a short
**ordering prefix** (e.g. `f-`) followed by the id and slug. They sort
lexicographically, and the prefix space is dense enough that you can
always slot a new entry between any two existing ones with **one rename**
— no cascade.

Current `todo/` (highest priority first):

```
b-024-bandcamp-feed-sync-stories-undefined
d-007-bandcamp-heard-status-sync
f-003-bandcamp-cover-controls-override
h-021-bandcamp-feed-sync-from-subdomain
j-022-bandcamp-search-discover-buttons
l-014-player-progress-bar-click-area
n-023-bandcamp-overlay-backdrop-blur
p-006-extension-media-key-support
r-005-extension-initial-preview-jump
```

Picking a prefix when reordering:

- **Move to top:** pick a string less than the current first prefix. Above
  `b`, use `a`. Above `a`, use a two-char `am` (or any `a?` where `?` is a
  letter — strings sort with `a` before `aa` before `am` before `b`).
- **Move to bottom:** pick a string greater than the current last. After
  `r`, use `t`, `v`, `x`, `z`. After `z`, use `za`, `zm`, `zz`.
- **Insert between two neighbours:** pick any string lexicographically
  between them. Between `b` and `d`, use `c`. Between `b` and `c`, use
  `bm`. Between `b` and `bm`, use `bg`. The space is infinite.

Convention: keep prefixes lowercase letters only. When you need to bisect
between two adjacent letters, append a middle letter (`m` is a fine
default). Don't worry about aesthetic balance — fix it the next time you
have a reason to touch the area.

`done/` and `dropped/` symlinks omit the ordering prefix — they sort by
id, which is fine for an archive.

## Adding a task

1. Pick the next free id (do not reuse numbers, even for dropped items).
   Slug is short kebab-case.
2. `cp -r backlog/_template backlog/tasks/<NNN>-<slug>` and fill in the
   spec.
3. Create a symlink in the appropriate status folder. From the repo root:
   ```sh
   ln -s ../tasks/<NNN>-<slug> backlog/todo/<prefix>-<NNN>-<slug>
   ```
   Pick `<prefix>` so the new symlink lands in the right priority position
   (see the bisection rules above).

If the task belongs to a story, link it from the story instead of putting
it in `todo/` directly:

```sh
ln -s ../../tasks/<NNN>-<slug> \
      backlog/stories/<story-id>-<slug>/<NNN>-<slug>
```

## Adding a story

A story is for work that is too big for one task but is still a single
user-facing change.

1. Pick the next free id.
2. Create the folder and a brief README:
   ```sh
   mkdir backlog/stories/<NNN>-<slug>
   $EDITOR backlog/stories/<NNN>-<slug>/README.md
   ```
   The README should describe the user-facing change, why, and what "done"
   looks like for the *story* (not each task). Keep it short — task
   acceptance criteria belong on the tasks.
3. Create the story's tasks under `tasks/` and link them from the story
   folder (see "Adding a task").
4. Add the story to the prioritised backlog with a symlink:
   ```sh
   ln -s ../stories/<NNN>-<slug> backlog/todo/<prefix>-<NNN>-<slug>
   ```

A story's member tasks should generally not have their own entries in
`todo/` — the story is what's prioritised. The exceptions are a task that
splits off and becomes independent, or a task that's blocked while the
rest of the story moves on.

## Adding an epic

An epic groups several stories under a shared theme. Epics carry no
implementation work — they exist purely to make the wider scope visible.

```sh
mkdir backlog/epics/<slug>
$EDITOR backlog/epics/<slug>/README.md       # the wider goal, why
ln -s ../../stories/<NNN>-<slug> \
      backlog/epics/<slug>/<NNN>-<slug>
```

Stories can belong to multiple epics — they're just symlinks. Epics never
appear in `todo/`, `in-progress/`, etc.; their progress is the aggregate
state of their stories.

## Working a task or story

1. `mv backlog/todo/<name> backlog/in-progress/<name>` to start.
2. Capture rejected approaches and surprising findings in `notes.md` as
   you go — future sessions will thank you.
3. When done, `mv backlog/in-progress/<name> backlog/done/<id>-<slug>` —
   strip the ordering prefix on the way in. The underlying folder stays
   put.

## Dependencies

When B depends on A, record it as a symlink inside B's folder. This works
for tasks depending on tasks, tasks depending on stories, or stories
depending on stories — the symlink just points at the depended-on folder.

```
tasks/<B-id>-<slug>/depends-on/<A-id>-<slug>      ->  ../../<A-id>-<slug>
stories/<B-id>-<slug>/depends-on/<A-id>-<slug>    ->  ../../<A-id>-<slug>
```

The `depends-on/` directory makes the dependency visible from inside the
item folder (an agent reading the brief sees it), grep-able from the repo
root, and resilient to status changes — the link still resolves whether A
is in `todo/` or `done/`.

Create one with:

```sh
mkdir -p backlog/tasks/<B-id>-<slug>/depends-on
ln -s ../../<A-id>-<slug> \
      backlog/tasks/<B-id>-<slug>/depends-on/<A-id>-<slug>
```

For a cross-kind dependency (task depending on a story, or vice versa),
point at the right tree:

```sh
ln -s ../../../stories/<A-id>-<slug> \
      backlog/tasks/<B-id>-<slug>/depends-on/<A-id>-<slug>
```

## Working with an AI agent

A fresh agent session should be able to pick up a task by reading **one
folder**. The principles below keep that working.

- **Self-contained tasks.** The task folder should have everything needed
  to start: what to build, why, where in the code, what "done" looks
  like. If the agent has to ask "what does X mean here?" the task is
  underspecified.
- **Stable IDs, mutable status.** Folder names under `tasks/` and
  `stories/` never change. Status and priority live entirely in the
  symlinks under `todo/`, `in-progress/`, etc.
- **Acceptance criteria up front.** The agent can't tell when it's done
  if you can't either. One or two bullets is fine, but make them
  testable.
- **Capture rejected approaches.** When the agent tries something that
  doesn't work, write it down in `notes.md`. Different sessions otherwise
  repeat the same mistakes — they have no memory of last week's dead end.
- **Link to code, don't duplicate it.** `packages/back/routes/foo.js:120`
  ages well; pasted snippets rot.
- **Right-size the spec.** A one-line fix doesn't need a novel; a
  multi-file refactor does. If a task spec exceeds roughly half a page
  of prose, it's probably a story with several tasks.
- **One task ≈ one PR.** Split when it gets bigger.
- **Refs over inline.** Screenshots, error logs, design exports go in
  `refs/`. Markdown stays readable.
- **Decisions live here, code lives in the repo.** The backlog explains
  *why*. The commit explains *what*. Don't paste diffs into items.
- **Brief the agent on the task, not the whole project.** Point the
  agent at `backlog/tasks/<id>-<slug>/` rather than describing the work
  in chat. The folder is the brief.
- **Search under `tasks/` and `stories/`, navigate via the status
  folders.** Tools like `rg` / `grep -r` follow symlinks inconsistently
  — keep content searches scoped to the canonical trees so each file is
  matched once. Status and epic folders are for reading and reordering,
  not for searching.

## Frontmatter fields

Tasks (and stories) carry a small frontmatter block:

```yaml
id: 001                            # zero-padded, matches folder prefix
title: Short summary
effort: M                          # S · M · L · XL  (rough t-shirt sizing)
created: 2026-05-04
```

Status, priority, and dependencies are not in frontmatter — they live in
the filesystem layout (status folder, ordering prefix, `depends-on/`
directory). Epics don't use frontmatter; their README is plain prose.
