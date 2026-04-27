# Fomo Player CLI and Agent Skill Design

**Date:** 2026-04-27
**Status:** Approved

---

## Overview

A `fomoplayer` CLI binary and an MCP-based agent skill that give users and Claude agents programmatic access to Fomo Player. The CLI and MCP server share a common JavaScript client library. Authentication uses long-lived API keys obtained via the existing OIDC handoff mechanism. Rate limiting is enforced per key. A read-only SQL query interface backed by PostgreSQL Row Level Security enables complex queries including embedding similarity searches.

---

## Package Structure

New package `packages/cli` added to the monorepo:

```
packages/cli/
  bin/
    fomoplayer.js              ← CLI entry point (yargs)
  src/
    client.js                  ← shared API client (auth header, HTTP)
    config.js                  ← reads/writes ~/.fomoplayer/config.json
    auth.js                    ← login flow (local server + browser open)
    commands/
      tracks.js
      follows.js
      carts.js
      ignores.js
      notifications.js
      settings.js
      api-keys.js
      query.js
      search.js
      stores.js
  mcp/
    server.js                  ← MCP server entry point (stdio)
    tools.js                   ← maps client methods → MCP tool definitions
  test/
    client.test.js
    auth.test.js
    commands/*.test.js
    mcp/tools.test.js
  package.json                 ← bin: { fomoplayer: ./bin/fomoplayer.js }

.claude/skills/fomoplayer.md   ← agent skill file
```

---

## Authentication Flow

Users authenticate once via `fomoplayer login`. The OIDC handoff mechanism is reused so the Google ID token is never exposed to the CLI.

```
fomoplayer login
  │
  ├─ CLI picks a random ephemeral port, starts a local HTTP server
  │
  ├─ Opens browser → GET /api/auth/login/cli?callbackPort=PORT
  │   (dedicated CLI login route — validates callbackPort is a valid port number,
  │    bypasses isSafeHandoffTarget which only accepts Railway PR URLs)
  │
  │   (existing OIDC flow)
  │
  ├─ Server mints a handoff JWT {oidcIssuer, oidcSubject} — NOT the Google token
  │
  ├─ Redirects to http://localhost:PORT/?token=<handoff_jwt>
  │
  ├─ CLI's local server POSTs { token, name: "fomoplayer CLI" }
  │   → POST /api/auth/api-keys/exchange-handoff
  │
  ├─ Backend: verifies token (one-time jti), looks up/creates user,
  │   generates "fp_<uuid>", stores SHA-256 hash in api_key table
  │
  ├─ Response: { key: "fp_<uuid>", id, name }  ← only time plaintext is returned
  │
  └─ CLI stores key in ~/.fomoplayer/config.json, local server shuts down
```

All subsequent CLI and MCP calls send `Authorization: Bearer fp_<uuid>`. A new Passport strategy hashes the bearer token and looks it up in the `api_key` table.

---

## Backend Additions

### New DB table: `api_key`

```sql
CREATE TABLE api_key (
  api_key_id              SERIAL PRIMARY KEY,
  api_key_hash            TEXT NOT NULL UNIQUE,   -- SHA-256 of fp_<uuid>
  api_key_prefix          TEXT NOT NULL,          -- first 8 chars for display
  api_key_name            TEXT NOT NULL,
  meta_account_user_id    INTEGER NOT NULL REFERENCES meta_account,
  api_key_created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  api_key_last_used_at    TIMESTAMPTZ,
  api_key_revoked_at      TIMESTAMPTZ,
  rate_limit_per_minute   INTEGER NOT NULL DEFAULT 60,
  rate_limit_per_day      INTEGER NOT NULL DEFAULT 1000
)
```

### New routes

```
GET    /api/auth/login/cli?callbackPort=PORT       ← starts OIDC flow for CLI
POST   /api/auth/api-keys/exchange-handoff         ← handoff token → API key
GET    /api/me/api-keys                            ← list keys (name, prefix, last used)
DELETE /api/me/api-keys/:id                        ← revoke key
POST   /api/me/query                               ← read-only SQL execution
DELETE /api/me/tracks/heard?since=<ts>             ← undo mark-heard
```

### Rate limiting

Enforced in-process with a sliding window (no Redis required). Two counters per key: per-minute burst and per-day cap. Returns 429 with `Retry-After` and `X-RateLimit-*` headers when exceeded. Counters reset on server restart (acceptable — no distributed deployment).

| Limit | Default |
|---|---|
| Per minute | 60 requests |
| Per day | 1000 requests |

### Query endpoint guardrails

1. SQL parser (`node-sql-parser`) rejects anything that is not a SELECT or read-only CTE
2. Executes in a read-only transaction: `BEGIN; SET TRANSACTION READ ONLY; SET LOCAL statement_timeout = '3s'; SET LOCAL app.current_user_id = <id>; …; COMMIT`
3. Results capped at 500 rows server-side
4. Runs under a dedicated `fomoplayer_query` DB role (SELECT-only, cannot bypass RLS)

### Row Level Security

RLS is enforced at the PostgreSQL level on all tables that contain user data. The `fomoplayer_query` role is not a superuser and cannot bypass policies.

**Direct `meta_account_user_id` policy** (applied to: `cart`, `user__track`, `user__artist_ignore`, `user__label_ignore`, `user__artist__label_ignore`, `user__release_ignore`, `store__artist_watch__user`, `store__label_watch__user`, `user__playlist_watch`, `user_search_notification`, `user_track_score_weight`, `user_notification_audio_sample`):
```sql
USING (meta_account_user_id = current_setting('app.current_user_id')::int)
```

**Subquery policies:**

`track__cart` — critical, must prevent cross-user cart access:
```sql
USING (cart_id IN (
  SELECT cart_id FROM cart
  WHERE meta_account_user_id = current_setting('app.current_user_id')::int
))
```

`user_notification_audio_sample_embedding`, `user_notification_audio_sample_fingerprint`, `user_notification_audio_sample_fingerprint_meta`:
```sql
USING (user_notification_audio_sample_id IN (
  SELECT user_notification_audio_sample_id FROM user_notification_audio_sample
  WHERE meta_account_user_id = current_setting('app.current_user_id')::int
))
```

**No RLS required** (no user data): all global catalog tables, ML/embedding tables for tracks, `source`, `cart__store`, `user_search_notification__store`.

---

## Table Exposure Reference

| Table | Structured API | Query API | Notes |
|---|---|---|---|
| `artist` | — | RO | Global catalog |
| `artist__genre` | — | RO | Global catalog |
| `cart` | RW | RO | RLS: direct |
| `cart__store` | RW | RO | No RLS needed |
| `genre` | — | RO | Global catalog |
| `key` | — | RO | Musical key catalog |
| `key_name` | — | RO | Musical key catalog |
| `key_system` | — | RO | Musical key catalog |
| `label` | — | RO | Global catalog |
| `playlist` | — | RO | Global catalog |
| `release` | — | RO | Global catalog |
| `release__track` | — | RO | Global catalog |
| `source` | — | RO | Provenance info, no user data |
| `store` | — | RO | Global catalog |
| `store__artist` | — | RO | Global catalog |
| `store__artist_watch` | — | RO | Catalog watch definitions |
| `store__artist_watch__user` | RW | RO | RLS: direct |
| `store__genre` | — | RO | Global catalog |
| `store__label` | — | RO | Global catalog |
| `store__label_watch` | — | RO | Catalog watch definitions |
| `store__label_watch__user` | RW | RO | RLS: direct |
| `store__release` | — | RO | Global catalog |
| `store__track` | — | RO | Global catalog |
| `store__track_preview` | — | RO | Global catalog |
| `store__track_preview_embedding` | — | RO | ML data, no RLS needed |
| `store__track_preview_fingerprint` | — | RO | ML data, no RLS needed |
| `store__track_preview_fingerprint_meta` | — | RO | ML data, no RLS needed |
| `store__track_preview_waveform` | — | RO | ML data, no RLS needed |
| `store_playlist_type` | — | RO | Global catalog |
| `track` | — | RO | Global catalog |
| `track__artist` | — | RO | Global catalog |
| `track__cart` | RW | RO | RLS: subquery via `cart` — critical |
| `track__genre` | — | RO | Global catalog |
| `track__key` | — | RO | Global catalog |
| `track__label` | — | RO | Global catalog |
| `track_details` | — | RO | Global catalog |
| `user__artist__label_ignore` | RW | RO | RLS: direct |
| `user__artist_ignore` | RW | RO | RLS: direct |
| `user__label_ignore` | RW | RO | RLS: direct |
| `user__playlist_watch` | RW | RO | RLS: direct |
| `user__release_ignore` | RW | RO | RLS: direct |
| `user__track` | RW | RO | RLS: direct |
| `user_notification_audio_sample` | — | RO | RLS: direct |
| `user_notification_audio_sample_embedding` | — | RO | RLS: subquery |
| `user_notification_audio_sample_fingerprint` | — | RO | RLS: subquery |
| `user_notification_audio_sample_fingerprint_meta` | — | RO | RLS: subquery |
| `user_search_notification` | RW | RO | RLS: direct |
| `user_search_notification__store` | RW | RO | No RLS needed |
| `user_track_score_weight` | RW | RO | RLS: direct |

**Internal (not exposed):** `authentication_method`, `email_queue`, `job`, `job_run`, `job_schedule`, `meta_account`, `meta_account__authentication_method_details`, `meta_account_email`, `meta_operation`, `meta_session`, `migrations`, `radiator_config`, `user__store_authorization`, `waiting_list`

---

## CLI Commands

Output defaults to human-readable tables. Every command accepts `--json` for machine-readable output.

```
fomoplayer login
fomoplayer logout

fomoplayer keys list
fomoplayer keys revoke <id>

fomoplayer tracks list [--store <store>] [--limit <n>]
fomoplayer tracks mark-heard <id>             # prints heardAt timestamp
fomoplayer tracks mark-heard --all [--interval <interval>]  # prints heardAt + count
fomoplayer tracks undo-heard --since <timestamp>

fomoplayer follows artists list [--store <store>]
fomoplayer follows artists add <url-or-id>
fomoplayer follows artists remove <id>
fomoplayer follows labels list [--store <store>]
fomoplayer follows labels add <url-or-id>
fomoplayer follows labels remove <id>
fomoplayer follows playlists list [--store <store>]
fomoplayer follows playlists add <url-or-id>
fomoplayer follows playlists remove <id>

fomoplayer carts list
fomoplayer carts create <name>
fomoplayer carts delete <id>
fomoplayer carts tracks list <cart-id>
fomoplayer carts tracks add <cart-id> <track-id...>
fomoplayer carts tracks remove <cart-id> <track-id...>

fomoplayer ignores artists list
fomoplayer ignores artists add <id>
fomoplayer ignores artists remove <id>
fomoplayer ignores labels list
fomoplayer ignores labels add <id>
fomoplayer ignores labels remove <id>
fomoplayer ignores releases add <id>

fomoplayer notifications list
fomoplayer notifications update
fomoplayer notifications search list
fomoplayer notifications search add <string> [--store <store>]
fomoplayer notifications search remove <id>

fomoplayer score-weights get
fomoplayer score-weights set <json>

fomoplayer settings get
fomoplayer settings set-email <email>

fomoplayer search artists <query>
fomoplayer search labels <query>
fomoplayer search tracks <query>

fomoplayer stores list

fomoplayer schema                             # prints exposable tables + columns
fomoplayer query "<SQL>"
fomoplayer query --file <path.sql>

fomoplayer config get
fomoplayer config set api-url <url>

fomoplayer completion bash|zsh|fish
```

---

## MCP Server

Runs as a long-lived stdio process. Configured in `.claude/settings.json`:

```json
{
  "mcpServers": {
    "fomoplayer": {
      "command": "fomoplayer",
      "args": ["mcp"]
    }
  }
}
```

### MCP Tools

| Tool | Description |
|---|---|
| `get_schema` | Returns exposable table names, columns, types for query planning |
| `execute_query` | Runs a read-only SQL query; capped at 500 rows; rejects non-SELECT client-side before sending |
| `get_tracks` | List tracks with optional store/limit filters |
| `mark_track_heard` | Mark one track heard; returns `{ heardAt }` |
| `mark_all_heard` | Mark all/interval tracks heard; returns `{ heardAt, count }` |
| `undo_mark_heard` | Clear heard status for tracks marked at or after `since` timestamp |
| `list_follows` / `add_follow` / `remove_follow` | Artists, labels, playlists |
| `list_ignores` / `add_ignore` / `remove_ignore` | Artists, labels, artist-on-label, releases |
| `list_carts` / `create_cart` / `delete_cart` | Cart management |
| `list_cart_tracks` / `update_cart_tracks` | Cart contents |
| `list_search_notifications` / `add_search_notification` / `remove_search_notification` | Keyword notifications |
| `get_score_weights` / `set_score_weights` | Scoring config |
| `get_settings` / `set_email` | User settings |
| `search` | Search artists, labels, tracks by name |
| `list_stores` | List available stores with IDs |
| `list_api_keys` / `revoke_api_key` | API key management |

### Typical agent workflow

```
# "Add all unheard Beatport tracks with BPM 125–130 to my DJ set cart"

1. get_schema()                          # understand available columns
2. execute_query("""
     SELECT st.track_id
     FROM store__track st
     JOIN store s ON s.store_id = st.store_id
     LEFT JOIN user__track ut ON ut.track_id = st.track_id
     WHERE s.store_name = 'beatport'
       AND st.store__track_bpm BETWEEN 125 AND 130
       AND ut.user__track_heard IS NULL
   """)                                  # → [{ track_id: 1 }, ...]
3. update_cart_tracks(cartId, trackIds)  # structured write
```

---

## Agent Skill File

`.claude/skills/fomoplayer.md` teaches the agent:

- When to reach for the MCP server (data queries, music curation, bulk operations)
- The `get_schema` → `execute_query` → structured-write workflow
- Common patterns: embedding similarity search, bulk follow/unfollow, cart curation
- Rate limit awareness (avoid tight loops)

---

## Testing Strategy

### Backend tests (`packages/back/test/tests/`)

- **API key exchange:** valid handoff token → key issued; replayed token rejected; expired token rejected
- **API key auth middleware:** valid key authenticates; revoked key rejected; unknown key rejected
- **Rate limiting:** burst (60/min) enforced; daily (1000/day) enforced; `Retry-After` header present on 429
- **Query endpoint:** SELECT accepted; INSERT/UPDATE/DELETE/DROP rejected by parser; read-only transaction rejects writes; `statement_timeout` fires on slow queries; row cap enforced
- **RLS:** cross-user access blocked on `user__track`, `track__cart`, `user_notification_audio_sample_*`
- **`undo_mark_heard`:** clears only rows at or after `since`; leaves earlier rows untouched

Note: handoff token mint/verify mechanics are already covered in `test/tests/users/auth/handoff-token.js`.

### CLI tests (`packages/cli/test/`)

- **Client:** auth header sent on every request; 401 triggers clear error; 429 surfaces rate limit info
- **Auth flow:** local server starts; receives token; exchanges for key; stores in config
- **Commands:** correct endpoint called with correct params; `--json` output is valid JSON; table output renders
- **Config:** reads/writes `~/.fomoplayer/config.json` correctly

### MCP tests (`packages/cli/test/mcp/`)

- Each tool calls the correct client method with correct arguments
- `execute_query` rejects non-SELECT before sending to backend
- `get_schema` returns expected table/column structure

### Penetration tests (`packages/back/test/tests/users/auth/api-key-pentest.js`)

- SQL injection via `execute_query`: UNION injection, stacked queries, comment bypasses, boolean blind
- RLS bypass: `SET app.current_user_id`, subquery to another user's `track__cart` / `user__track`
- API key timing: response time does not leak key validity
- Rate limit bypass: `X-Forwarded-For` spoofing, rapid key rotation

---

## Security Notes

- API key stored as SHA-256 hash in DB; plaintext returned only at creation time
- Handoff token is one-time use (jti tracked in `auth_handoff_jti` table)
- Query API runs as `fomoplayer_query` DB role — SELECT-only, RLS enforced, no superuser
- `track__cart` RLS is the most critical: prevents a user reading another user's cart contents via SQL
- `user_notification_audio_sample` and subtables are personal content; all require RLS
- Rate limiting protects against agent runaway loops and cost blowouts
