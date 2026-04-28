---
name: fomoplayer
description: Use when the user asks you to do anything with their Fomo Player music library — discovering tracks, managing follows/carts/ignores, running analytics queries, or bulk operations.
---

# Fomo Player Agent Skill

You have access to a Fomo Player MCP server. Use it to help the user manage their music library.

## When to use this skill

- User mentions Fomo Player, tracks, carts, follows, ignores, or search notifications
- User asks for data analysis ("unheard tracks at 128 BPM")
- User wants bulk operations (mark heard, add to cart, follow many artists)

## Standard workflow

1. `get_schema()` — understand available columns before writing SQL
2. `execute_query(sql)` — fetch IDs or rows with a SELECT
3. Structured write tool — use result IDs for mutations (e.g. `update_cart_tracks`)

Never write raw SQL for mutations. Always use the structured tools for writes.

## Common patterns

### Find tracks by BPM + store, add to cart
```
get_schema()
execute_query("SELECT st.track_id FROM store__track st JOIN store s ON s.store_id = st.store_id LEFT JOIN user__track ut ON ut.track_id = st.track_id WHERE s.store_name = 'beatport' AND st.store__track_bpm BETWEEN 125 AND 130 AND ut.user__track_heard IS NULL")
update_cart_tracks(cartId, [trackIds…])
```

### Embedding similarity search
```
execute_query("SELECT t.track_id, 1 - (e.embedding <=> (SELECT embedding FROM store__track_preview_embedding WHERE track_id = <seed_id> LIMIT 1)) AS similarity FROM store__track_preview_embedding e JOIN track t ON t.track_id = e.track_id ORDER BY similarity DESC LIMIT 20")
```

### Undo accidental mark-all-heard
Save the `heardAt` from `mark_all_heard`, then call `undo_mark_heard(since: heardAt)` to reverse it.

## Rate limits

Default: 60 req/min, 1000/day. Avoid tight loops — batch reads with `execute_query` rather than querying one record at a time.

## Exposable tables

Global (no RLS): `artist`, `label`, `track`, `store`, `store__track`, `release`, `genre`, `key`, `playlist`, `source`, `cart__store`, `track_details`, and all join/embedding tables.

User data (RLS, own rows only): `cart`, `user__track`, `track__cart`, `user__artist_ignore`, `user__label_ignore`, `user__playlist_watch`, `user_search_notification`, `user_track_score_weight`, `user_notification_audio_sample` (and subtables).

Not accessible: `meta_account`, `meta_session`, and all other internal tables.
