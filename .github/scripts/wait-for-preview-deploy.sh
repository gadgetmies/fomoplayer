#!/usr/bin/env bash
set -euo pipefail

# Wait until the Railway PR preview serves the pull request's own commit.
#
# Usage: wait-for-preview-deploy.sh <preview-url> <expected-sha>
#
# A preview that answers HTTP 200 is not enough: while Railway builds and
# deploys a new push, the previous build keeps serving, so a demo started then
# records the old code. Instead this logs in as the preview admin and polls
# /api/admin/info, whose `version` is the deployed commit
# (RAILWAY_GIT_COMMIT_SHA), until it equals <expected-sha>.
#
# Login uses the same keyless GitHub Actions OIDC flow as the demo test
# (POST /api/auth/login/actions). A fresh token is minted for every attempt:
# the tokens are short-lived and the wait can outlast one. The job therefore
# needs `id-token: write`, which provides:
#   ACTIONS_ID_TOKEN_REQUEST_URL, ACTIONS_ID_TOKEN_REQUEST_TOKEN
#
# Optional env:
#   WAIT_ATTEMPTS          attempts before giving up (default 90)
#   WAIT_INTERVAL_SECONDS  pause between attempts (default 10)
#
# If the preview logs in but reports no version (RAILWAY_GIT_COMMIT_SHA unset),
# the commit cannot be checked; the script warns and continues rather than
# failing every demo.
#
# Railway skips pushes that only change files outside the `build.watchPatterns`
# in railway.json (OpenSpec artifacts, docs, the analyser, ...), so the preview
# keeps serving an earlier commit. When every file changed between the deployed
# commit and <expected-sha> is outside those patterns, the deployed build is
# the PR's code and the wait ends. Run from a checkout of the repository.

URL="${1:?usage: wait-for-preview-deploy.sh <preview-url> <expected-sha>}"
EXPECTED_SHA="${2:?usage: wait-for-preview-deploy.sh <preview-url> <expected-sha>}"
ATTEMPTS="${WAIT_ATTEMPTS:-90}"
INTERVAL="${WAIT_INTERVAL_SECONDS:-10}"

: "${ACTIONS_ID_TOKEN_REQUEST_URL:?ACTIONS_ID_TOKEN_REQUEST_URL is required (job needs id-token: write)}"
: "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:?ACTIONS_ID_TOKEN_REQUEST_TOKEN is required (job needs id-token: write)}"

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

# Set by fetch_deployed_version.
DEPLOYED_VERSION=''
FAILURE=''

# Logs in with a fresh OIDC token and reads the deployed commit into
# DEPLOYED_VERSION. Returns non-zero, with the reason in FAILURE, when the
# preview is not reachable yet or refuses the login.
fetch_deployed_version() {
  local token status body
  DEPLOYED_VERSION=''
  FAILURE=''

  token="$(curl -sf -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
    "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=${URL}" | jq -r '.value // empty')" || true
  if [ -z "$token" ]; then
    FAILURE='could not mint an OIDC token'
    return 1
  fi
  echo "::add-mask::${token}"

  : >"$COOKIE_JAR"
  status="$(jq -n --arg token "$token" '{token: $token}' |
    curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE_JAR" \
      -H 'Content-Type: application/json' --data-binary @- \
      "${URL}/api/auth/login/actions")" || status='000'
  if [ "$status" != '204' ]; then
    FAILURE="login returned HTTP ${status}"
    return 1
  fi

  body="$(curl -s -b "$COOKIE_JAR" -w '\n%{http_code}' "${URL}/api/admin/info")" || body=$'\n000'
  status="${body##*$'\n'}"
  body="${body%$'\n'*}"
  if [ "$status" != '200' ]; then
    FAILURE="/api/admin/info returned HTTP ${status}"
    return 1
  fi
  DEPLOYED_VERSION="$(jq -r '.version // ""' <<<"$body" 2>/dev/null)" || {
    FAILURE='/api/admin/info did not return JSON'
    return 1
  }
}

# Succeeds when every file changed between the deployed commit and
# EXPECTED_SHA is outside Railway's watch paths, i.e. Railway skipped those
# pushes and the deployed build already has the PR's code. Only the two
# commits' trees are needed, so a shallow checkout fetches them by SHA.
only_unwatched_changes_since() {
  local deployed="$1" sha changed watched
  for sha in "$deployed" "$EXPECTED_SHA"; do
    git cat-file -e "${sha}^{commit}" 2>/dev/null ||
      git fetch -q --no-tags --depth=1 origin "$sha" 2>/dev/null || return 1
  done
  changed="$(git diff --no-renames --name-only "$deployed" "$EXPECTED_SHA")" || return 1
  watched="$(printf '%s\n' "$changed" | node "${SCRIPT_DIR}/railway-watched-paths.js")" || return 1
  if [ -n "$watched" ]; then
    return 1
  fi
  echo "Changes since ${deployed:0:7} are all outside Railway's watch paths, so Railway did not redeploy:"
  printf '%s\n' "$changed" | sed 's/^/  /'
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Waiting for ${URL} to serve ${EXPECTED_SHA} ..."
for i in $(seq 1 "$ATTEMPTS"); do
  if fetch_deployed_version; then
    if [ "$DEPLOYED_VERSION" = "$EXPECTED_SHA" ]; then
      echo "Preview serves ${EXPECTED_SHA} (attempt ${i})"
      exit 0
    fi
    if [ -z "$DEPLOYED_VERSION" ]; then
      echo "::warning::The preview does not report its commit (RAILWAY_GIT_COMMIT_SHA unset), so it cannot be checked to be ${EXPECTED_SHA}; continuing."
      exit 0
    fi
    if only_unwatched_changes_since "$DEPLOYED_VERSION"; then
      echo "Preview serves ${DEPLOYED_VERSION:0:7}, which has the code of ${EXPECTED_SHA:0:7} (attempt ${i})"
      exit 0
    fi
    echo "Attempt ${i}/${ATTEMPTS}: preview serves ${DEPLOYED_VERSION:0:7}, waiting for ${EXPECTED_SHA:0:7}; retrying in ${INTERVAL}s"
  else
    echo "Attempt ${i}/${ATTEMPTS}: ${FAILURE}; retrying in ${INTERVAL}s"
  fi
  sleep "$INTERVAL"
done

echo "::error::The preview did not serve ${EXPECTED_SHA} within $((ATTEMPTS * INTERVAL)) seconds"
exit 1
