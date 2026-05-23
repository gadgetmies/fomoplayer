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

declare -A cache_name cache_slug live_name live_slug
while IFS=$'\t' read -r id name slug; do
  [ -n "$id" ] || continue
  cache_name[$id]="$name"
  cache_slug[$id]="$slug"
done <<<"$cache_tsv"
while IFS=$'\t' read -r id name slug; do
  [ -n "$id" ] || continue
  live_name[$id]="$name"
  live_slug[$id]="$slug"
done <<<"$live_tsv"

mapfile -t live_ids < <(printf '%s\n' "${!live_name[@]}" | sort -n)
mapfile -t cache_ids < <(printf '%s\n' "${!cache_name[@]}" | sort -n)

added=() renamed=() removed=()
for id in "${live_ids[@]}"; do
  if [ -z "${cache_name[$id]+set}" ]; then
    added+=("$id ${live_name[$id]} (${live_slug[$id]})")
  elif [ "${cache_name[$id]}" != "${live_name[$id]}" ] || [ "${cache_slug[$id]}" != "${live_slug[$id]}" ]; then
    renamed+=("$id ${live_name[$id]} (${live_slug[$id]}) [was ${cache_name[$id]} / ${cache_slug[$id]}]")
  fi
done
for id in "${cache_ids[@]}"; do
  [ -z "${live_name[$id]+set}" ] && removed+=("$id ${cache_name[$id]} (${cache_slug[$id]})")
done

report() {
  local label="$1"
  shift
  if [ "$#" -eq 0 ]; then
    printf '  %-9s none\n' "$label" >&2
  else
    printf '  %-9s %s\n' "$label" "$1" >&2
    shift
    for line in "$@"; do printf '            %s\n' "$line" >&2; done
  fi
}

printf 'Fetched %d genres; cache has %d.\n' "${#live_ids[@]}" "${#cache_ids[@]}" >&2
report "added:" ${added[@]+"${added[@]}"}
report "removed:" ${removed[@]+"${removed[@]}"}
report "renamed:" ${renamed[@]+"${renamed[@]}"}
printf '\nPaste the block below into routes/stores/beatport/genres.js:\n\n' >&2

echo "const GENRES = ["
for id in "${live_ids[@]}"; do
  name="${live_name[$id]//\'/\\\'}"
  printf "  { id: %s, name: '%s', slug: '%s' },\n" "$id" "$name" "${live_slug[$id]}"
done
echo "]"
