#!/usr/bin/env python3
"""PreToolUse guard: keep the MAIN checkout unchanged from Bash.

The Bash counterpart of enforce-worktree.py (see docs/contributing-workflow.md).
Every change is made and committed in a linked git worktree; the main checkout
only receives the user-gated ``git merge --no-ff <change>``. It gates two kinds
of commands when they target this repo's main checkout:

git, by subcommand:
- ``commit|add|rm|mv|restore|clean|apply|am`` are **denied**: they stage, commit
  or rewrite files in the main checkout, and that work belongs in a worktree.
- ``merge|pull|reset|rebase|cherry-pick|revert|checkout|switch|stash`` are
  **asked**: they include the legitimate user-gated merge back into the main
  checkout and the recovery steps, which must stay possible once the user agrees.
- a ``merge`` whose source branch still has ``wip``/``fixup!``/``squash!``
  commits is **denied**: clean the branch into atomic commits first.

file writes (best effort): shell redirections (``>``/``>>``), ``tee``, ``sed -i``
/ ``perl -i``, ``rm``, ``mv``, ``cp``, ``touch``, ``mkdir``, ``ln``, ``chmod`` …
whose target resolves into the main checkout are **denied**. Writes made by
other programs (a build, a formatter, a script) are not detected — the rule in
CLAUDE.md still applies to them.

Not gated: the same commands in a linked worktree, read-only git, ``git
worktree``/``git branch``, and paths outside this repo. The effective cwd is
tracked across the command's segments, so ``cd <worktree> && git commit`` (or
``WT=…; cd "$WT"``, or ``git -C "$WT" commit``) is judged against the worktree.
Fails open on any uncertainty. Adapted from track-feature-extractor's
enforce-main-checkout-git.py.
"""
import json
import os
import re
import shlex
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _checkout import git, main_checkout_of  # noqa: E402

DENIED_GIT = {"commit", "add", "rm", "mv", "restore", "clean", "apply", "am"}
ASKED_GIT = {"merge", "pull", "reset", "rebase", "cherry-pick", "revert",
             "checkout", "switch", "stash"}
# shell operators that separate one simple command from the next.
_SEP = re.compile(r"&&|\|\||[;\n|&()]")
# git global options that consume a following value (skip it to find the verb).
_VALUE_OPTS = {"-C", "-c", "--git-dir", "--work-tree", "--namespace",
               "--exec-path", "--super-prefix"}
_WRAPPERS = {"sudo", "command", "env", "nice", "nohup", "time", "xargs"}
_ENV_ASSIGN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
# commands whose every non-option argument is written / removed.
_WRITES_ALL = {"rm", "rmdir", "unlink", "mv", "touch", "mkdir", "tee",
               "truncate"}
# commands whose first non-option argument is not a path (mode / owner).
_WRITES_AFTER_FIRST = {"chmod", "chown", "chgrp"}
# commands that write only their last argument (the destination).
_WRITES_LAST = {"cp", "ln", "rsync", "install"}
_REDIRECT = re.compile(r"^(?:\d*|&)>>?\|?(.*)$")


_HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")


def _strip_heredocs(command):
    """Drop heredoc bodies so the text inside them (code with `>` in it, a
    commit message mentioning `git add`) isn't read as commands."""
    out = []
    terminators = []
    for line in command.split("\n"):
        if terminators:
            if line.strip() == terminators[0]:
                terminators.pop(0)
            continue
        out.append(line)
        terminators += [m.group(2) for m in _HEREDOC.finditer(line)]
    return "\n".join(out)


def _segments(command):
    for seg in _SEP.split(_strip_heredocs(command)):
        seg = seg.strip()
        if seg:
            yield seg


def _tokens(seg):
    try:
        return shlex.split(seg)
    except ValueError:
        return None  # unbalanced quotes (e.g. a split heredoc) -> skip


def _skip_prefix(toks):
    i = 0
    while i < len(toks) and (_ENV_ASSIGN.match(toks[i]) or toks[i] in _WRAPPERS):
        i += 1
    return i


def _git_invocation(toks):
    """Return (subcommand, cwd_override, args) if toks invoke git, else None."""
    i = _skip_prefix(toks)
    if i >= len(toks) or os.path.basename(toks[i]) != "git":
        return None
    i += 1
    cwd_override = None
    while i < len(toks):
        t = toks[i]
        if t in _VALUE_OPTS:
            if t == "-C" and i + 1 < len(toks):
                cwd_override = toks[i + 1]
            i += 2
            continue
        m = re.match(r"^(-C|-c|--git-dir|--work-tree|--namespace|--exec-path"
                     r"|--super-prefix)=(.*)$", t)
        if m:
            if m.group(1) == "-C":
                cwd_override = m.group(2)
            i += 1
            continue
        if t.startswith("-"):
            i += 1
            continue
        return (t, cwd_override, toks[i + 1:])
    return None


_ASSIGN = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")


def _expand(token, varz):
    """Best-effort expand a token to a path: ``~`` and a whole-token ``$VAR`` /
    ``${VAR}`` (optionally ``/subpath``) assigned earlier in the command. None
    when it still holds an unresolved ``$`` or backtick."""
    if not token:
        return None
    t = token
    m = re.match(r"^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?(/.*)?$", t)
    if m:
        val = varz.get(m.group(1))
        if val is None:
            return None
        t = val + (m.group(2) or "")
    if "$" in t or "`" in t:
        return None
    return os.path.expanduser(t)


def _assignment(seg):
    m = _ASSIGN.match(seg.strip())
    if not m:
        return None
    rhs = _tokens(m.group(2))
    if rhs is None or len(rhs) > 1:
        return None
    return (m.group(1), rhs[0] if rhs else "")


def _cd_target(toks):
    i = _skip_prefix(toks)
    if i >= len(toks) or toks[i] != "cd":
        return None
    j = i + 1
    while j < len(toks) and toks[j].startswith("-"):
        j += 1
    return toks[j] if j < len(toks) else "~"


_MERGE_VALUE_OPTS = {"-m", "--message", "-F", "--file", "-s", "--strategy",
                     "-X", "--strategy-option"}
_WIP_RE = re.compile(r"^\s*(wip\b|fixup!|squash!)", re.IGNORECASE)


def _merge_refs(args):
    refs = []
    i = 0
    while i < len(args):
        t = args[i]
        if t in _MERGE_VALUE_OPTS:
            i += 2
            continue
        if not t.startswith("-"):
            refs.append(t)
        i += 1
    return refs


def _branch_has_wip(refs, cwd):
    for ref in refs:
        out = git(["log", "--no-merges", "--format=%s", "HEAD..%s" % ref], cwd)
        for line in (out or "").splitlines():
            if _WIP_RE.match(line):
                return True
    return False


def _write_targets(toks):
    """Paths a simple command writes to: redirection targets plus the file
    arguments of the common file-mutating commands."""
    targets = []
    i = 0
    while i < len(toks):
        m = _REDIRECT.match(toks[i])
        if m and toks[i] not in ("<", "<<"):
            rest = m.group(1)
            if rest.startswith("&"):  # 2>&1
                pass
            elif rest:
                targets.append(rest)
            elif i + 1 < len(toks):
                targets.append(toks[i + 1])
                i += 1
        i += 1
    # redirections may appear anywhere; drop them before reading the argv.
    argv = []
    i = 0
    while i < len(toks):
        m = _REDIRECT.match(toks[i])
        if m and not m.group(1):
            i += 2
            continue
        if m:
            i += 1
            continue
        argv.append(toks[i])
        i += 1
    i = _skip_prefix(argv)
    if i >= len(argv):
        return targets
    cmd = os.path.basename(argv[i])
    args = argv[i + 1:]
    plain = [a for a in args if not a.startswith("-")]
    if cmd in _WRITES_ALL:
        targets += plain
    elif cmd in _WRITES_AFTER_FIRST:
        targets += plain[1:]
    elif cmd in _WRITES_LAST and plain:
        targets.append(plain[-1])
    elif cmd == "sed" and any(a == "-i" or a.startswith("-i") or
                              a.startswith("--in-place") for a in args):
        has_script_opt = any(a in ("-e", "-f") or a.startswith("--expression")
                             for a in args)
        files = []
        skip_next = False
        for a in args:
            if skip_next:
                skip_next = False
                continue
            if a in ("-e", "-f"):
                skip_next = True
                continue
            if not a.startswith("-"):
                files.append(a)
        if not has_script_opt:
            files = files[1:]
        # BSD `sed -i '' …`: an empty suffix argument is not a file.
        targets += [f for f in files if f]
    elif cmd == "perl" and any(re.match(r"^-\w*i", a) for a in args):
        skip_next = False
        for a in args:
            if skip_next:
                skip_next = False
                continue
            if re.match(r"^-\w*[eE]$", a):
                skip_next = True
                continue
            if not a.startswith("-"):
                targets.append(a)
    return targets


def _decision(decision, reason):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": reason,
        }
    }))


def _resolve(raw, effective_cwd, varz):
    path = _expand(raw, varz)
    if path is None:
        return None
    if not os.path.isabs(path):
        path = os.path.join(effective_cwd, path)
    return os.path.normpath(path)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    if data.get("tool_name") not in (None, "Bash"):
        return
    command = ((data.get("tool_input") or {}).get("command")) or ""
    if not command:
        return

    base_cwd = data.get("cwd") or os.getcwd()
    effective_cwd = base_cwd
    varz = {}

    for seg in _segments(command):
        assign = _assignment(seg)
        if assign is not None:
            name, val = assign
            if "$" not in val and "`" not in val:
                varz[name] = os.path.expanduser(val)
            continue
        toks = _tokens(seg)
        if not toks:
            continue

        cd_raw = _cd_target(toks)
        if cd_raw is not None:
            target = _resolve(cd_raw, effective_cwd, varz)
            if target and os.path.isdir(target):
                effective_cwd = target
            continue

        inv = _git_invocation(toks)
        if inv:
            sub, cwd_override, args = inv
            cwd = _resolve(cwd_override, effective_cwd, varz) if cwd_override \
                else effective_cwd
            if not cwd or not os.path.isdir(cwd):
                cwd = effective_cwd
            if sub not in DENIED_GIT and sub not in ASKED_GIT:
                continue
            toplevel = main_checkout_of(cwd)
            if not toplevel:
                continue
            if sub == "merge" and _branch_has_wip(_merge_refs(args), cwd):
                return _decision("deny", (
                    "Denied: the branch you're merging into the main checkout "
                    "still has wip/fixup!/squash! commits. Clean it into atomic "
                    "commits in its worktree (`git reset --soft <base>` and "
                    "re-commit; rebase -i is unavailable here), rerun the tests, "
                    "then merge."))
            if sub in DENIED_GIT:
                return _decision("deny", (
                    "Denied: `git %s` in the MAIN checkout (%s). Per "
                    "docs/contributing-workflow.md, all work and its commits "
                    "happen in a linked worktree on the change's branch; the "
                    "main checkout only receives the user-gated "
                    "`git merge --no-ff <change>`. Create a worktree:\n"
                    "  git -C %s worktree add ../%s-<change> -b <change> master"
                    % (sub, toplevel, toplevel, os.path.basename(toplevel))))
            return _decision("ask", (
                "Ask-first: `git %s` changes the MAIN checkout (%s). Per "
                "docs/contributing-workflow.md, merging a verified change back "
                "and other main-checkout git operations are user-gated. Proceed "
                "only if the user asked for this; otherwise work in the "
                "change's worktree." % (sub, toplevel)))

        for raw in _write_targets(toks):
            path = _resolve(raw, effective_cwd, varz)
            if not path or path.startswith("/dev/"):
                continue
            toplevel = main_checkout_of(path)
            if toplevel:
                return _decision("deny", (
                    "Denied: this command writes %s, which is in the MAIN "
                    "checkout (%s). Per docs/contributing-workflow.md, never "
                    "modify files in the main checkout. Make the change in the "
                    "change's worktree (`git -C %s worktree add ../%s-<change> "
                    "-b <change> master`)."
                    % (path, toplevel, toplevel, os.path.basename(toplevel))))


if __name__ == "__main__":
    main()
