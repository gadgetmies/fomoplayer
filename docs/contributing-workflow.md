# Contributing workflow: every change in a worktree

Agents never modify files in the **main checkout**
(`~/Documents/Projects/Code/fomoplayer`, the working tree that owns `.git`).
Every change — code, docs, OpenSpec artifacts, brainstorming design docs,
`.claude/` config — is made and committed in its own **git worktree** and reaches
the main checkout only through a merge once it has been verified.

Why: several agents work on this repo at once. Uncommitted edits in the main
checkout block `git merge` ("your local changes would be overwritten"), get
mixed into whichever branch happens to be checked out, and end up on no branch
at all. A worktree per change keeps each change on its own branch, testable on
its own, and mergeable at any time. (The workflow is adapted from
`../track-feature-extractor`'s `docs/contributing-workflow.md`.)

## Lifecycle

1. **Create the worktree before the first edit** — including before generating
   spec files. Derive the kebab-case change name and branch off `master` with a
   branch named like the worktree:

   ```bash
   git -C ~/Documents/Projects/Code/fomoplayer worktree add \
     ../fomoplayer-<change> -b <change> master
   cd ../fomoplayer-<change> && yarn install
   ```

   A worktree needs its own `yarn install`; tests run against symlinked or
   missing dependencies give false failures. Then **record the change in project
   memory** (below).

2. **Author specs in the worktree.** Run `brainstorm-to-openspec` /
   `i-openspec-propose` (or `openspec new change`) with the working directory
   inside the worktree, so `docs/superpowers/specs/…` and
   `openspec/changes/<change>/` land there. Commit the artifacts as the branch's
   first commit. Specs written in the main checkout are untracked files a fresh
   worktree does not contain — they would be stranded on no branch.

3. **Implement and commit in the worktree.** Commit on the worktree's branch as
   the work progresses; no permission is needed for commits there. Never commit
   in the main checkout.

4. **Verify in the worktree.** Run the change's tests (and, for UI changes, the
   demo tests required by `CLAUDE.md`) from the worktree. Nothing needs to be
   merged to be tried. Hand off to the user with the concrete command that
   exercises the worktree.

5. **Merge back once verified — the user gates it.**
   - In the worktree, bring in the latest `master` and resolve any conflicts
     there, then rerun the tests: `git merge master`.
   - Clean any `wip`/`fixup!`/`squash!` commits into atomic commits first (the
     guard refuses to merge them).
   - With the user's go-ahead, merge in the main checkout, which must be on
     `master` with a clean tree:

     ```bash
     git -C ~/Documents/Projects/Code/fomoplayer merge --no-ff <change>
     ```

     Because the branch already contains `master`, this merge is conflict-free.
     If it does conflict, `git merge --abort` and resolve in the worktree.
   - When the change goes through a GitHub PR instead, push the worktree branch
     and open the PR from it; after the PR merges, update the main checkout with
     `git pull` (also user-gated).

6. **Iterate.** Fix reported problems in the still-intact worktree, commit there,
   and merge again.

7. **Clean up only when the user confirms the change is done.** Merging is not
   that confirmation. On the go-ahead: archive the OpenSpec change *in the
   worktree* (`openspec archive <change>`, commit, merge once more), then remove
   the worktree (`git worktree remove ../fomoplayer-<change>`), delete the branch
   (`git branch -d <change>`) and delete the project-memory entry.

## Track each in-flight change in project memory

Create one project memory entry per change when its worktree is created
(`<change>-status`, `type: project`): the worktree path and branch, the goal in
one line, the status (proposed / implementing / tests green / handed off /
merged, awaiting approval) and the next step. Keep it current and delete it at
cleanup. A fresh or compacted session should be able to resume from it alone.

## Enforcement

`.claude/settings.json` runs two PreToolUse hooks (tests:
`python3 -m unittest discover -s .claude/hooks`):

- `.claude/hooks/enforce-worktree.py` denies Edit/Write/NotebookEdit on any file
  in the main checkout. Linked worktrees (including ones under
  `.claude/worktrees/`) and paths outside this repo are allowed.
- `.claude/hooks/enforce-main-checkout-bash.py` checks Bash commands against the
  main checkout:
  - denies `git commit|add|rm|mv|restore|clean|apply|am`;
  - asks before `git merge|pull|reset|rebase|cherry-pick|revert|checkout|switch|stash`;
  - denies merging a branch that still has `wip`/`fixup!`/`squash!` commits;
  - denies shell writes into the main checkout: redirections, `tee`, `sed -i`,
    `perl -i`, `rm`, `mv`, `cp`, `touch`, `mkdir`, `ln`, `chmod`.

The Bash check is best effort: files written by other programs (builds,
formatters, scripts, `yarn install`) are not detected. Don't run such commands
in the main checkout. Run them in the worktree.

## Don't destroy uncommitted work

Never `git checkout` / `git restore` / `git stash drop` a file you didn't change
yourself. It may hold another session's uncommitted work, and nothing brings it
back. Undo your own edits surgically.
