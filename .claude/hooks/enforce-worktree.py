#!/usr/bin/env python3
"""PreToolUse guard: never edit files in the MAIN checkout.

Denies Edit/Write/NotebookEdit when the target file lies in this repo's main
checkout, on any branch and under any path — code, docs, OpenSpec artifacts,
``.claude/`` alike. Every change is made in a linked git worktree and reaches
the main checkout only through the user-gated merge (see
docs/contributing-workflow.md). Keeping the main checkout untouched is what lets
several worktrees be merged back into it without uncommitted edits blocking or
tangling the merges.

Allowed: edits inside any linked worktree (including ones nested under
``.claude/worktrees/``), and paths outside this repository (scratchpad, agent
memory, other repos). Fails open on any uncertainty — a guard must never wedge
legitimate work. Adapted from track-feature-extractor's enforce-worktree.py.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _checkout import main_checkout_of  # noqa: E402


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    tool_input = data.get("tool_input") or {}
    file_path = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
    toplevel = main_checkout_of(file_path)
    if not toplevel:
        return
    name = os.path.basename(toplevel)
    reason = (
        "Blocked: %s is in the MAIN checkout (%s). Per "
        "docs/contributing-workflow.md, never modify files in the main checkout "
        "— that includes OpenSpec artifacts and docs. Create a worktree for the "
        "change first and edit there:\n"
        "  git -C %s worktree add ../%s-<change> -b <change> master\n"
        "then edit the same path under ../%s-<change>/."
        % (file_path, toplevel, toplevel, name, name)
    )
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))


if __name__ == "__main__":
    main()
