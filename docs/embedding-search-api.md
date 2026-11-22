# Embedding search API

For clients that hold their own track embeddings (Harmonia, the desktop DJ library): they send vectors of a shared
track-embedding specification version and get Fomo Player's tracks ranked by how close their store previews sound. No
audio is sent, and nothing from a request is stored. Code: `packages/back/routes/embeddings/`; tests:
`packages/back/test/tests/embeddings/similar-tracks.js`.

The vectors follow the specification in github.com/gadgetmies/track-embedding (`SPECIFICATION.md`). Version
`track-embedding/1` is what the analyser has always stored as `discogs_multi_embeddings-effnet-bs64-1`
(`packages/back/routes/shared/embedding-versions.js` maps stored types to versions).

## Authentication and limits

Both routes take a user API key only: `Authorization: Bearer fp_…`. A desktop client gets one through the browser
hand-off that ends in `POST /api/auth/api-keys/exchange-handoff` (see `docs/auth/oidc-login-flow.md`). A browser
session cookie is not accepted. Each request counts against the key's per-minute and per-day limits like every API-key
request; over the limit the answer is `429` with `Retry-After`.

| Status | Body | When |
|---|---|---|
| 401 | depends on the cause, e.g. `{ "error": "Invalid or revoked API key" }`, `{ "error": "api_key_required", … }` for a signed-in browser session, or no body | no API key, another kind of credential, or an unknown or revoked key |
| 429 | `{ "error": "Rate limit exceeded" }` | the key's limit is used up |

## `GET /api/embeddings/versions`

The versions this instance holds preview vectors of.

```json
{ "versions": [{ "version": "track-embedding/1", "coverage": "preview", "count": 77012 }] }
```

`coverage` is what the indexed vectors were computed from (`preview`: store previews); `count` is the number of
previews holding a vector of that version.

## `POST /api/embeddings/similar-tracks`

Request (JSON, at most 4 MB):

```json
{
  "version": "track-embedding/1",
  "coverage": "full",
  "vectors": [[0.0123, -0.0456, …], …],
  "limit": 50
}
```

- `version`: a version listed by `GET /api/embeddings/versions`.
- `coverage`: what the query vectors were computed from, `full` (whole files) or `preview`.
- `vectors`: 1 to 50 vectors of exactly 1280 finite numbers each, not all zero (not normalised; similarity is cosine).
- `limit`: optional, an integer from 1 to 200; default 50.

Each track's distance is the smallest cosine distance between any of its previews' vectors and any query vector
(several query vectors search as one, without averaging). Tracks the API key's user has heard, ignores (artist, label,
release, or artist on label) or bought are left out, as in the cart similarity search. The search uses the HNSW
index, so it is approximate.

Response, nearest first:

```json
{
  "version": "track-embedding/1",
  "tracks": [
    {
      "id": 123,
      "url": "https://<frontend>/search?q=track%3A123",
      "distance": 0.0123,
      "similarity": 0.9877,
      "queryIndex": 0,
      "title": "Track title",
      "version": "Original Mix",
      "artists": [{ "id": 1, "name": "Artist" }],
      "remixers": [],
      "labels": [{ "id": 2, "name": "Label" }],
      "releaseDate": "2026-04-01",
      "durationMs": 312000,
      "stores": [{ "name": "Beatport", "code": "beatport", "url": "https://…", "releaseUrl": "https://…" }]
    }
  ]
}
```

- `distance`: cosine distance (0 = same direction); `similarity` = `max(0, 1 − distance)`.
- `queryIndex`: the 0-based position in `vectors` of the query vector the track is nearest to.
- `url`: the track in Fomo Player's web app (the instance's configured front-end URL).
- `version`, `releaseDate`, `durationMs`, `url` and `releaseUrl` may be `null`.

Errors:

| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "invalid_request", "message": … }` | the body breaks a rule above; nothing is searched |
| 409 | `{ "error": "embedding_version_unsupported", "message": …, "versions": [ …as GET /versions… ] }` | the version is not indexed here |

Example:

```sh
curl -s -X POST "$FOMOPLAYER_API_URL/embeddings/similar-tracks" \
  -H "Authorization: Bearer $FOMOPLAYER_API_KEY" -H 'Content-Type: application/json' \
  -d @query.json
```
