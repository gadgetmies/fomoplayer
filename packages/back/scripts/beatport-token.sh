#!/usr/bin/env bash
#
# Prints a Beatport v4 API access token to stdout by running the same
# login -> authorize -> token OAuth flow as routes/stores/beatport/beatport-token.js.
# fetch-beatport-genres.sh sources its token from here; run it on its own to
# eyeball a token or feed other curl calls against api.beatport.com/v4.
#
# Requires curl + jq and Beatport credentials in the environment:
#   BEATPORT_USERNAME=... BEATPORT_PASSWORD=... ./beatport-token.sh
set -euo pipefail

IDENTITY_URL="https://account.beatport.com"
# Fixed Beatport OAuth identifiers (not deployment URLs): the public client of
# the API docs app and its registered post-message redirect.
CLIENT_ID="${BEATPORT_CLIENT_ID:-0GIvkCltVIuPkkwSJHp6NDb3s0potTjLBQr388Dd}"
REDIRECT_URI="https://account.beatport.com/o/post-message/?origin=https://api.beatport.com"

: "${BEATPORT_USERNAME:?set BEATPORT_USERNAME and BEATPORT_PASSWORD}"
: "${BEATPORT_PASSWORD:?set BEATPORT_USERNAME and BEATPORT_PASSWORD}"

jar="$(mktemp)"
trap 'rm -f "$jar"' EXIT

# 1. Log in for a session cookie (jq -n builds the JSON so credentials with
#    quotes or backslashes can't break out of the body).
login_body="$(jq -n --arg u "$BEATPORT_USERNAME" --arg p "$BEATPORT_PASSWORD" '{username: $u, password: $p}')"
if ! curl -sS -c "$jar" -H 'Content-Type: application/json' \
  --data-binary "$login_body" \
  --fail-with-body "$IDENTITY_URL/identity/v1/login/" >/dev/null; then
  echo "beatport-token: login failed; check BEATPORT_USERNAME/BEATPORT_PASSWORD" >&2
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
  echo "beatport-token: authorize returned no code (location: ${location:-none})" >&2
  exit 1
fi

# 3. Exchange the code for an access token.
access_token="$(curl -sS --fail-with-body "$IDENTITY_URL/o/token/" \
  --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "code=$code" \
  --data-urlencode "redirect_uri=$REDIRECT_URI" |
  jq -r '.access_token // empty')"
if [ -z "$access_token" ]; then
  echo "beatport-token: token exchange did not return an access_token" >&2
  exit 1
fi

printf '%s\n' "$access_token"
