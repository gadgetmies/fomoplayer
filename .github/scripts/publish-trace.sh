#!/usr/bin/env bash
set -euo pipefail

# Publish Playwright trace zip(s) to the gh-pages branch so they can be opened
# one-click in https://trace.playwright.dev/?trace=<url> without downloading.
#
# Usage: publish-trace.sh <kind> <trace-dir>
#   <kind>      local | preview (the subdirectory the traces land under)
#   <trace-dir> directory holding the *.zip trace files
#
# Required env:
#   GITHUB_TOKEN       token with contents:write on this repo
#   GITHUB_REPOSITORY  owner/repo (provided by Actions)
#   PR_NUMBER          pull request number
#
# Traces are written to traces/pr-<PR_NUMBER>/<kind>/ on the gh-pages branch.
# Each PR/kind owns its own subdirectory, so concurrent runs do not overwrite
# one another; pushes that race are retried after re-syncing to the remote tip.
#
# IMPORTANT: the preview trace MUST already be redacted (see redact-trace.js)
# before calling this — the gh-pages branch is world-readable on a public repo.

KIND="${1:?usage: publish-trace.sh <kind> <trace-dir>}"
TRACE_DIR="${2:?usage: publish-trace.sh <kind> <trace-dir>}"

: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${PR_NUMBER:?PR_NUMBER is required}"

shopt -s nullglob
zips=("$TRACE_DIR"/*.zip)
shopt -u nullglob
if [ ${#zips[@]} -eq 0 ]; then
  echo "[publish-trace] No trace zips in ${TRACE_DIR}; nothing to publish."
  exit 0
fi

dest_rel="traces/pr-${PR_NUMBER}/${KIND}"
remote="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

git clone --quiet --depth 1 --branch gh-pages --single-branch "$remote" "$workdir" 2>/dev/null && have_branch=1 || have_branch=0

if [ "$have_branch" = "0" ]; then
  echo "[publish-trace] gh-pages branch not found — creating it."
  rm -rf "$workdir"
  mkdir -p "$workdir"
  git -C "$workdir" init --quiet
  git -C "$workdir" checkout --quiet -b gh-pages
  git -C "$workdir" remote add origin "$remote"
fi

git -C "$workdir" config user.name "github-actions[bot]"
git -C "$workdir" config user.email "github-actions[bot]@users.noreply.github.com"

copy_files() {
  rm -rf "${workdir:?}/${dest_rel}"
  mkdir -p "${workdir}/${dest_rel}"
  cp "${zips[@]}" "${workdir}/${dest_rel}/"
}

attempt=0
max_attempts=5
delay=2
while :; do
  attempt=$((attempt + 1))
  copy_files
  git -C "$workdir" add --all
  if git -C "$workdir" diff --cached --quiet; then
    echo "[publish-trace] No changes to publish."
    break
  fi
  git -C "$workdir" commit --quiet -m "Publish ${KIND} demo trace for PR #${PR_NUMBER}"
  if git -C "$workdir" push --quiet origin gh-pages; then
    echo "[publish-trace] Published ${#zips[@]} trace(s) to ${dest_rel} on gh-pages."
    break
  fi
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "::error::Failed to push traces to gh-pages after ${max_attempts} attempts."
    exit 1
  fi
  echo "[publish-trace] Push rejected (attempt ${attempt}/${max_attempts}) — re-syncing and retrying in ${delay}s."
  sleep "$delay"
  delay=$((delay * 2))
  # Re-sync to the remote tip; our subdirectory is preserved on the next copy.
  if [ "$have_branch" = "1" ] || git -C "$workdir" ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
    have_branch=1
    git -C "$workdir" fetch --quiet origin gh-pages
    git -C "$workdir" reset --quiet --hard origin/gh-pages
  fi
done
