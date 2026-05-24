#!/usr/bin/env bash
#
# Fetches the Beatport genre catalog from the v4 API with curl and verifies it
# against the in-code cache (routes/stores/beatport/genres.js). Prints, to stderr,
# a diff (added / removed / renamed genres) and, to stdout, a ready-to-paste
# GENRES array. Run it whenever the checkBeatportGenres job reports drift or to
# discover the Open Format genre ids, then paste the block into genres.js.
#
# Requires curl + jq and Beatport credentials in the environment:
#   BEATPORT_USERNAME=... BEATPORT_PASSWORD=... ./fetch-beatport-genres.sh
# A token can be supplied directly via BEATPORT_ACCESS_TOKEN to skip the login.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENRES_JS="$SCRIPT_DIR/../routes/stores/beatport/genres.js"
IDENTITY_URL="https://account.beatport.com"
API_BASE="https://api.beatport.com/v4"
# Fixed Beatport OAuth identifiers (not deployment URLs): the public client of
# the API docs app and its registered post-message redirect.
CLIENT_ID="${BEATPORT_CLIENT_ID:-0GIvkCltVIuPkkwSJHp6NDb3s0potTjLBQr388Dd}"
REDIRECT_URI="https://account.beatport.com/o/post-message/?origin=https://api.beatport.com"

# Obtain an access token, either supplied directly or via the same
# login -> authorize -> token OAuth flow as routes/stores/beatport/beatport-token.js.
if [ -n "${BEATPORT_ACCESS_TOKEN:-}" ]; then
  token="$BEATPORT_ACCESS_TOKEN"
else
  : "${BEATPORT_USERNAME:?set BEATPORT_USERNAME and BEATPORT_PASSWORD (or BEATPORT_ACCESS_TOKEN)}"
  : "${BEATPORT_PASSWORD:?set BEATPORT_USERNAME and BEATPORT_PASSWORD (or BEATPORT_ACCESS_TOKEN)}"

  jar="$(mktemp)"
  trap 'rm -f "$jar"' EXIT

  # 1. Log in for a session cookie (jq -n builds the JSON so credentials with
  #    quotes or backslashes can't break out of the body).
  login_body="$(jq -n --arg u "$BEATPORT_USERNAME" --arg p "$BEATPORT_PASSWORD" '{username: $u, password: $p}')"
  if ! curl -sS -c "$jar" -H 'Content-Type: application/json' \
    --data-binary "$login_body" \
    --fail-with-body "$IDENTITY_URL/identity/v1/login/" >/dev/null; then
    echo "fetch-beatport-genres: login failed; check BEATPORT_USERNAME/BEATPORT_PASSWORD" >&2
    exit 1
  fi

  # 2. Authorize for an auth code. curl does not follow the redirect, so the code
  #    is read straight off the Location header.
  location="$(curl -sS -b "$jar" -o /dev/null -D - -G "$IDENTITY_URL/o/authorize/" \
    --data-urlencode "response_type=code" \
    --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "redirect_uri=$REDIRECT_URI" |
    tr -d '\r' | sed -n 's/^[Ll]ocation: //p')"
  code="$(printf '%s' "$location" | sed -n 's/.*[?&]code=\([^&]*\).*/\1/p')"
  if [ -z "$code" ]; then
    echo "fetch-beatport-genres: authorize returned no code (location: ${location:-none})" >&2
    exit 1
  fi

  # 3. Exchange the code for an access token.
  token="$(curl -sS --fail-with-body "$IDENTITY_URL/o/token/" \
    --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "grant_type=authorization_code" \
    --data-urlencode "code=$code" \
    --data-urlencode "redirect_uri=$REDIRECT_URI" |
    jq -r '.access_token // empty')"
  if [ -z "$token" ]; then
    echo "fetch-beatport-genres: token exchange did not return an access_token" >&2
    exit 1
  fi
fi

# Walk the paginated genres collection, keeping enabled genres as id<TAB>name<TAB>slug.
live_tsv="$(
  next="/catalog/genres/?per_page=200"
  while [ -n "$next" ]; do
    page="$(curl -sS --fail-with-body -H "Authorization: Bearer $token" -H 'Accept: application/json' "$API_BASE$next")"
    printf '%s\n' "$page" | jq -r '.results[] | select(.enabled != false) | [.id, .name, .slug] | @tsv'
    next="$(printf '%s' "$page" | jq -r '.next // empty')"
    next="${next#"$API_BASE"}"
  done | sort -t$'\t' -k1,1n
)"

if [ -z "$live_tsv" ]; then
  echo "fetch-beatport-genres: the API returned no genres" >&2
  exit 1
fi

# The cache lines look like: { id: 5, name: 'House', slug: 'house' },
cache_tsv="$(sed -n "s/.*{ id: \([0-9]*\), name: '\(.*\)', slug: '\([^']*\)' }.*/\1\t\2\t\3/p" "$GENRES_JS" | sort -t$'\t' -k1,1n)"

# Diff the live catalog against the cache (added / removed / renamed) for review.
# awk keeps this portable to bash 3.2 (macOS), which lacks associative arrays.
{
  awk -F'\t' '
    function report(label, arr, count,   i) {
      if (count == 0) { printf "  %-9s none\n", label; return }
      printf "  %-9s %s\n", label, arr[1]
      for (i = 2; i <= count; i++) printf "            %s\n", arr[i]
    }
    FNR == NR { cseen[$1] = 1; cname[$1] = $2; cslug[$1] = $3; corder[++cn] = $1; next }
    { lseen[$1] = 1; lname[$1] = $2; lslug[$1] = $3; lorder[++ln] = $1 }
    END {
      printf "Fetched %d genres; cache has %d.\n", ln, cn
      for (i = 1; i <= ln; i++) {
        id = lorder[i]
        if (!(id in cseen)) added[++na] = id " " lname[id] " (" lslug[id] ")"
        else if (cname[id] != lname[id] || cslug[id] != lslug[id])
          renamed[++nr] = id " " lname[id] " (" lslug[id] ") [was " cname[id] " / " cslug[id] "]"
      }
      for (i = 1; i <= cn; i++) {
        id = corder[i]
        if (!(id in lseen)) removed[++nd] = id " " cname[id] " (" cslug[id] ")"
      }
      report("added:", added, na)
      report("removed:", removed, nd)
      report("renamed:", renamed, nr)
    }
  ' <(printf '%s\n' "$cache_tsv") <(printf '%s\n' "$live_tsv")
  printf '\nPaste the block below into routes/stores/beatport/genres.js:\n\n'
} >&2

echo "const GENRES = ["
printf '%s\n' "$live_tsv" | while IFS=$'\t' read -r id name slug; do
  [ -n "$id" ] || continue
  name="${name//\'/\\\'}"
  printf "  { id: %s, name: '%s', slug: '%s' },\n" "$id" "$name" "$slug"
done
echo "]"
