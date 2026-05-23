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
API_BASE="https://api.beatport.com/v4"

token="${BEATPORT_ACCESS_TOKEN:-$("$SCRIPT_DIR/beatport-token.sh")}"

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
