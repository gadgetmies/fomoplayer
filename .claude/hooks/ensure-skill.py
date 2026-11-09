#!/usr/bin/env python3
"""SessionStart hook: require the `commit-and-test-discipline` skill.

This repo's changes must follow the `commit-and-test-discipline` skill, which is
NOT vendored here — it is installed on demand from the personal skill collection
(`gadgetmies/agent-skills`) via `npx skills`, so there is one canonical copy.

At session start this checks whether the skill is installed (user-level or
project-level, or recorded in the `npx skills` lockfile). If it is missing, it
injects context instructing the agent to STOP and ask the user to install it
before doing any work. If it is present, the hook is silent.

Fails open: any error -> no output -> session proceeds (a guard must never wedge
a session).
"""
import json
import os
import sys

SKILL = "commit-and-test-discipline"
REPO = "gadgetmies/agent-skills"
INSTALL_CMD = "npx skills add %s -s %s -g" % (REPO, SKILL)


def _has_skill_dir(base):
    return os.path.exists(os.path.join(base, "skills", SKILL, "SKILL.md"))


def _installed(project_dir):
    home = os.path.expanduser("~")
    # user-level agent skill dirs (npx skills / Claude Code)
    for base in (os.path.join(home, ".claude"), os.path.join(home, ".agents")):
        if _has_skill_dir(base):
            return True
    # project-level install
    if project_dir and _has_skill_dir(os.path.join(project_dir, ".claude")):
        return True
    # npx skills lockfile record
    lock = os.path.join(home, ".agents", ".skill-lock.json")
    try:
        with open(lock) as f:
            data = json.load(f)
        if SKILL in (data.get("skills") or {}):
            return True
    except Exception:
        pass
    return False


def main():
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR")
    try:
        data = json.load(sys.stdin)
        project_dir = project_dir or data.get("cwd")
    except Exception:
        pass

    if _installed(project_dir):
        return  # skill present -> nothing to inject

    context = (
        "REQUIRED SKILL NOT INSTALLED: `%s`.\n"
        "Changes in this repository MUST follow the `%s` skill, and it is not "
        "installed on this machine. Before doing ANY work here (editing files, "
        "committing, running tests, planning a change):\n"
        "  1. Tell the user the skill is required but missing.\n"
        "  2. Ask permission to install it, then run:\n"
        "       %s\n"
        "  3. After it installs, read/invoke the skill and follow it for all "
        "commit and test work.\n"
        "Do not proceed with repository changes until the skill is installed and "
        "read. (Canonical source: the %s collection.)"
        % (SKILL, SKILL, INSTALL_CMD, REPO)
    )
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context,
        }
    }))


if __name__ == "__main__":
    main()
