"""Shared helpers for the worktree guards: classify a path's git checkout.

The repo's rule (docs/contributing-workflow.md): every change is made in a
linked git worktree; the MAIN checkout (the primary working tree that owns
``.git``) is never modified by an agent, so concurrent worktrees can always be
merged back into it.

Only paths belonging to THIS repository are guarded — the repo whose hooks are
running, identified by ``$CLAUDE_PROJECT_DIR`` (or the hook's own location).
Other repositories, the scratchpad and the agent's memory directory are not
affected. Every helper fails open (returns None) on any uncertainty.
"""
import os
import subprocess


def git(args, cwd):
    try:
        r = subprocess.run(["git", *args], cwd=cwd, capture_output=True,
                           text=True, timeout=10)
    except Exception:
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def _existing_dir(path):
    d = path if os.path.isdir(path) else os.path.dirname(path)
    while d and not os.path.isdir(d):
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent
    return d or None


def _common_dir(d):
    common = git(["rev-parse", "--git-common-dir"], d)
    if not common:
        return None
    if not os.path.isabs(common):
        common = os.path.join(d, common)
    return os.path.realpath(common)


def _this_repo_common_dir():
    project = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return _common_dir(project) if os.path.isdir(project) else None


def main_checkout_of(path):
    """Return the main checkout's top-level dir if ``path`` lies in this repo's
    MAIN checkout (not in a linked worktree, not inside ``.git``); else None."""
    if not path:
        return None
    d = _existing_dir(os.path.abspath(os.path.expanduser(path)))
    if not d:
        return None
    toplevel = git(["rev-parse", "--show-toplevel"], d)
    if not toplevel:
        return None  # not in a work tree (outside git, or inside .git)
    gitdir = git(["rev-parse", "--absolute-git-dir"], d)
    common = _common_dir(d)
    if not gitdir or not common:
        return None
    if os.path.realpath(gitdir) != common:
        return None  # a linked worktree
    ours = _this_repo_common_dir()
    if ours and ours != common:
        return None  # some other repository
    return toplevel
