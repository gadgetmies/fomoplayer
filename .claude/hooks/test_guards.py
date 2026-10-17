"""Tests for the worktree guards. Run: python3 -m unittest discover -s .claude/hooks

Each test runs the hook scripts as Claude Code does (JSON on stdin) against a
throwaway repository with a main checkout and one linked worktree.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HOOKS = os.path.dirname(os.path.abspath(__file__))


def sh(*args, cwd):
    subprocess.run(args, cwd=cwd, check=True, capture_output=True)


class GuardTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = os.path.realpath(cls.tmp.name)
        cls.main = os.path.join(root, "repo")
        cls.wt = os.path.join(root, "repo-change")
        cls.other = os.path.join(root, "other")
        for d in (cls.main, cls.other):
            os.makedirs(d)
            sh("git", "init", "-q", "-b", "master", cwd=d)
            sh("git", "-c", "user.email=t@t", "-c", "user.name=t", "commit",
               "-q", "--allow-empty", "-m", "init", cwd=d)
        sh("git", "worktree", "add", "-q", cls.wt, "-b", "change", cwd=cls.main)
        sh("git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q",
           "--allow-empty", "-m", "wip: halfway", cwd=cls.wt)
        os.makedirs(os.path.join(cls.main, "docs"))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def run_hook(self, script, payload):
        env = dict(os.environ, CLAUDE_PROJECT_DIR=self.main)
        r = subprocess.run([sys.executable, os.path.join(HOOKS, script)],
                           input=json.dumps(payload), capture_output=True,
                           text=True, env=env, check=True)
        if not r.stdout.strip():
            return "allow"
        return json.loads(r.stdout)["hookSpecificOutput"]["permissionDecision"]

    def edit(self, path, tool="Edit"):
        key = "notebook_path" if tool == "NotebookEdit" else "file_path"
        return self.run_hook("enforce-worktree.py",
                             {"tool_name": tool, "tool_input": {key: path}})

    def bash(self, command, cwd=None):
        return self.run_hook("enforce-main-checkout-bash.py", {
            "tool_name": "Bash", "cwd": cwd or self.main,
            "tool_input": {"command": command}})

    # --- Edit / Write / NotebookEdit ---

    def test_edit_in_main_checkout_is_denied_for_any_path(self):
        for rel in ("packages/back/x.js", "openspec/changes/c/proposal.md",
                    "docs/new.md", ".claude/settings.json", "CLAUDE.md"):
            self.assertEqual(self.edit(os.path.join(self.main, rel)), "deny", rel)
        self.assertEqual(self.edit(os.path.join(self.main, "a.ipynb"),
                                   "NotebookEdit"), "deny")

    def test_edit_in_worktree_or_elsewhere_is_allowed(self):
        self.assertEqual(self.edit(os.path.join(self.wt, "docs/new.md")), "allow")
        self.assertEqual(self.edit(os.path.join(self.other, "x.md")), "allow")
        self.assertEqual(self.edit(os.path.join(self.main, ".git/x")), "allow")
        self.assertEqual(self.edit("/nonexistent/dir/file.txt"), "allow")

    # --- git ---

    def test_git_commit_and_add_in_main_checkout_are_denied(self):
        self.assertEqual(self.bash("git commit -m x"), "deny")
        self.assertEqual(self.bash("git add -A"), "deny")
        self.assertEqual(self.bash("git -C %s commit -m x" % self.main,
                                   cwd=self.wt), "deny")

    def test_git_in_worktree_is_allowed(self):
        self.assertEqual(self.bash("git add -A && git commit -m x", cwd=self.wt),
                         "allow")
        self.assertEqual(self.bash("cd %s && git commit -m x" % self.wt), "allow")
        self.assertEqual(self.bash('WT=%s; cd "$WT"; git commit -m x' % self.wt),
                         "allow")
        self.assertEqual(self.bash("git -C %s commit -m x" % self.wt), "allow")

    def test_merge_back_is_asked_and_wip_merge_is_denied(self):
        self.assertEqual(self.bash("git merge --no-ff master"), "ask")
        self.assertEqual(self.bash("git checkout master"), "ask")
        self.assertEqual(self.bash("git merge --no-ff change"), "deny")

    def test_read_only_git_and_worktree_add_are_allowed(self):
        for cmd in ("git status", "git log --oneline", "git diff",
                    "git worktree add ../repo-x -b x master", "git branch -d x"):
            self.assertEqual(self.bash(cmd), "allow", cmd)

    def test_other_repo_is_not_guarded(self):
        self.assertEqual(self.bash("git commit -m x", cwd=self.other), "allow")

    # --- file writes from Bash ---

    def test_writes_into_main_checkout_are_denied(self):
        for cmd in ("echo x > docs/a.md", "echo x >> %s/docs/a.md" % self.main,
                    "printf x | tee docs/a.md", "sed -i '' 's/a/b/' docs/a.md",
                    "sed -i.bak -e 's/a/b/' docs/a.md", "perl -pi -e 's/a/b/' x",
                    "rm -rf docs", "mv a b", "cp /etc/hosts docs/",
                    "touch new.txt", "mkdir -p openspec/changes/c",
                    "chmod +x run.sh", "cat > docs/a.md <<'EOF'\nhi\nEOF"):
            self.assertEqual(self.bash(cmd), "deny", cmd)

    def test_writes_elsewhere_and_reads_are_allowed(self):
        for cmd in ("echo x > /dev/null", "ls 2>&1", "cat docs/a.md",
                    "grep -r foo . > %s/out.txt" % self.other,
                    "cp docs/a.md %s/" % self.other, "sed 's/a/b/' docs/a.md",
                    "cd %s && echo x > a.md" % self.wt,
                    "cat > %s/x.py <<'EOF'\nif a > b: pass\nEOF" % self.other):
            self.assertEqual(self.bash(cmd), "allow", cmd)
        self.assertEqual(self.bash("echo x > a.md", cwd=self.wt), "allow")


if __name__ == "__main__":
    unittest.main()
