#!/usr/bin/env node

// Builds DJ set ground truth from a track-feature-extractor ("akin") catalog
// render, for evaluating scripts/dj-set/tracklist.js.
//
// The render's timeline_snapshot gives every track's placement in the mix:
// its track-local -> set map (startMs + (ms - startNativeMs) * stretch, the
// same uniform placement the dj-automation renderer uses) and the transition
// regions around it. Each play is reconstructed from the catalog the way the
// render made it:
// - a track sounds from the start of the transition region into it to the end
//   of the region out of it (a track entered and left on the same cue is
//   collapsed to one second in the timeline but still plays through both);
// - beat jumps (set_beat_jump) cut or replay bars of the track, so the edited
//   time the map yields is mapped back to the original track positions;
// - layers (set_layer: a borrowed track or its stems over a backbone track)
//   are not in the timeline: the source cue (src_cue_index) is pinned to the
//   backbone cue plus offset, the source is beat-locked to the backbone, and
//   it is audible where its authored volume lanes are above zero over the
//   canvas window (store._layer_window_frame, spine _render_layer).
// Each catalog track is mapped to
// the fomoplayer track ids it may be matched as: by the Beatport id in its
// file name, by ISRC, and by artist + title when neither yields a track.
//
// Usage (DATABASE_URL = the database holding the preview fingerprints; the
// connection is read-only):
//   node scripts/dj-set/truth-from-akin.js --catalog=/Volumes/DJ/AKIN/tracks.akincatalog \
//     --render-id=564 --output=s30-564.truth.json
// or, for a render made outside the catalog, its timeline in the same shape
// as set_render.timeline_snapshot (the catalog still resolves track files):
//   node scripts/dj-set/truth-from-akin.js --catalog=... --timeline=truth-timeline.json \
//     --audio=final.wav --output=variant.truth.json
//
// Needs the sqlite3 CLI.

const { execFileSync } = require('child_process')
const fs = require('fs')
const sql = require('sql-template-strings')
const { pg, assertReadOnly } = require('./lib/read-only-db')
const { parseArgs } = require('./lib/args')
const { layerAudibleFractions, editedToOriginal, overlapMs } = require('./lib/akin-geometry')

const sqliteJson = (catalog, query) => {
  const out = execFileSync('sqlite3', ['-readonly', '-json', catalog, query], { encoding: 'utf8', maxBuffer: 1 << 28 })
  return out.trim() ? JSON.parse(out) : []
}

const integerLiteral = (value) => {
  const n = Number(value)
  if (!Number.isInteger(n)) throw new Error(`not an integer: ${value}`)
  return n
}

// Beatport downloads end in the track id ("..._(Original_Mix)_18161943.mp3");
// some library files start with it ("4A - 87 - 599465_Timewarp_...").
const beatportIdsFromPath = (path) => {
  const name = (path || '').split('/').pop()
  const ids = new Set()
  const trailing = name.match(/_(\d{4,9})\.[a-z0-9]+$/i)
  if (trailing) ids.add(trailing[1])
  const leading = name.match(/(?:^|- )(\d{4,9})_/)
  if (leading) ids.add(leading[1])
  return [...ids]
}

// Normalised titles at least this long are unlikely to belong to another song.
const DISTINCTIVE_TITLE_LENGTH = 10

const normalise = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const firstArtist = (artist) => (artist || '').split(/,|&| feat\.? | ft\.? | x /i)[0]
const titleWithoutVersion = (title) => (title || '').replace(/\s*[([].*$/, '').trim()

const trackIdsFor = async (catalogTrack) => {
  const ids = new Set()
  const beatportIds = beatportIdsFromPath(catalogTrack.track_path)
  if (beatportIds.length > 0) {
    const rows = await pg.queryRowsAsync(sql`
      SELECT DISTINCT st.track_id
      FROM store__track st NATURAL JOIN store s
      WHERE s.store_name = 'Beatport' AND st.store__track_store_id = ANY(${beatportIds})`)
    rows.forEach((r) => ids.add(r.track_id))
  }
  if (catalogTrack.track_isrc) {
    const rows = await pg.queryRowsAsync(sql`SELECT track_id FROM track WHERE track_isrc = ${catalogTrack.track_isrc}`)
    rows.forEach((r) => ids.add(r.track_id))
  }
  if (ids.size === 0) {
    // Mashups and edits carry no ids. Their title may include the version,
    // fomoplayer stores it separately, so compare the bare title. Store
    // credits differ between releases (VIER – LOOK AT THE TREES is credited
    // to its features on Beatport), so a distinctive title alone also counts.
    const title = normalise(titleWithoutVersion(catalogTrack.title))
    const rows = await pg.queryRowsAsync(sql`
      SELECT DISTINCT t.track_id
      FROM track t NATURAL JOIN track__artist NATURAL JOIN artist
      WHERE regexp_replace(lower(t.track_title), '[^a-z0-9]', '', 'g') = ${title}
        AND (regexp_replace(lower(artist_name), '[^a-z0-9]', '', 'g') = ${normalise(firstArtist(catalogTrack.artist))}
             OR ${title.length >= DISTINCTIVE_TITLE_LENGTH})`)
    rows.forEach((r) => ids.add(r.track_id))
  }
  return [...ids]
}

const previewsFor = async (trackIds) =>
  trackIds.length === 0
    ? []
    : pg.queryRowsAsync(sql`
      SELECT st.track_id, stp.store__track_preview_id AS preview_id
           , stp.store__track_preview_start_ms AS start_ms, stp.store__track_preview_end_ms AS end_ms
           , EXISTS (SELECT 1 FROM store__track_preview_fingerprint_meta m
                     WHERE m.store__track_preview_id = stp.store__track_preview_id
                       AND m.store__track_preview_fingerprint_count > 0) AS fingerprinted
      FROM store__track st NATURAL JOIN store__track_preview stp
      WHERE st.track_id = ANY(${trackIds})`)

// The transition regions are the automation windows: the outgoing track plays
// to the end of its region and the incoming one opens at its start.
const audibleSpanMs = (t, timeline) => {
  const regions = timeline.transitionRegions || []
  const into = regions.find((x) => x.afterRow === t.row - 1)
  const outOf = regions.find((x) => x.afterRow === t.row)
  return {
    startMs: into ? Math.min(t.startMs, into.startMs) : t.startMs,
    endMs: outOf ? Math.max(t.endMs, outOf.endMs) : t.endMs,
  }
}

const beatJumpsByRow = (catalog, setId) => {
  const byRow = new Map()
  if (setId === undefined || setId === null) return byRow
  for (const j of sqliteJson(
    catalog,
    `SELECT position, position_ms, size_bars FROM set_beat_jump WHERE set_id = ${integerLiteral(setId)} ORDER BY position, seq`,
  )) {
    if (!byRow.has(j.position)) byRow.set(j.position, [])
    byRow.get(j.position).push({ positionMs: Number(j.position_ms), sizeBars: Number(j.size_bars) })
  }
  return byRow
}

// Beat-locking plays a source at the backbone's tempo; catalog BPMs may be
// half or double time (87 vs 174), so use the octave nearest the backbone's.
const sameOctave = (bpm, reference) => {
  let b = bpm
  while (b < reference / Math.SQRT2) b *= 2
  while (b > reference * Math.SQRT2) b /= 2
  return b
}

const catalogGrid = (catalog, trackId) => {
  const [track] = sqliteJson(
    catalog,
    `SELECT t.track_artist AS artist, t.track_title AS title, t.track_path, t.track_isrc,
            COALESCE(g.bpm, t.track_bpm) AS bpm, COALESCE(t.track_grid_offset_ms, 0) AS grid_offset_ms
     FROM track t LEFT JOIN track_beat_grid g USING (track_id) WHERE t.track_id = ${integerLiteral(trackId)}`,
  )
  const cues = new Map(
    sqliteJson(catalog, `SELECT cue_index, position_ms FROM track_cue WHERE track_id = ${integerLiteral(trackId)}`).map(
      (c) => [c.cue_index, c.position_ms + track.grid_offset_ms],
    ),
  )
  return { ...track, bpm: Number(track.bpm), cues }
}

const layerLanes = (catalog, layerId) =>
  Object.fromEntries(
    sqliteJson(
      catalog,
      `SELECT param_id, control_points_json FROM set_layer_lane WHERE layer_id = ${integerLiteral(layerId)} AND side = 'a'`,
    ).map((l) => [l.param_id, JSON.parse(l.control_points_json)]),
  )

// The enabled layers of the render's set that the render included (its
// snapshot lists them by artist and title), placed in set time through the
// backbone's timeline row.
const layerPlays = (catalog, render, timeline) => {
  const rendered = JSON.parse(render.snapshot || '{}').metadata?.layers || []
  if (rendered.length === 0) return []
  const renderedKeys = new Set(rendered.map((l) => `${l.artist}\u0000${l.title}`))
  const layers = sqliteJson(
    catalog,
    `SELECT l.*, c.start_bar, c.end_bar, c.anchor_bar
     FROM set_layer l LEFT JOIN set_layer_canvas c USING (layer_id)
     WHERE l.set_id = ${integerLiteral(render.set_id)} AND l.enabled = 1 AND c.layer_id IS NOT NULL`,
  )
  const rowByTrack = new Map(timeline.tracks.map((t) => [t.trackId, t]))
  const plays = []
  for (const layer of layers) {
    const backboneRow = rowByTrack.get(layer.backbone_track_id)
    if (!backboneRow) continue
    const backbone = catalogGrid(catalog, layer.backbone_track_id)
    const source = catalogGrid(catalog, layer.source_track_id)
    if (!renderedKeys.has(`${source.artist}\u0000${source.title}`)) continue
    const alignCueMs = backbone.cues.get(layer.tgt_cue_index)
    if (alignCueMs === undefined || !backbone.bpm || !source.bpm) continue
    // Backbone-native ms: the ALIGN pin and the canvas window around it.
    const barMs = 240000 / backbone.bpm
    const pinMs = alignCueMs + Number(layer.offset_value) * (layer.offset_unit === 'bars' ? barMs : barMs / 4)
    const windowStartMs = Math.max(0, pinMs - Math.max(0, layer.anchor_bar - layer.start_bar) * barMs)
    const windowEndMs = pinMs + Math.max(0, layer.end_bar - layer.anchor_bar) * barMs
    const stems = (layer.stems || '').split(',').filter(Boolean)
    // The source cue lands on the pin; source ms per backbone ms while
    // beat-locked at the backbone's tempo.
    const sourceCueMs = source.cues.get(layer.src_cue_index) ?? 0
    const ratio = backbone.bpm / sameOctave(source.bpm, backbone.bpm)
    const toSource = (backboneMs) => sourceCueMs + (backboneMs - pinMs) * ratio
    // Before its start the source is silent.
    const sourceStartMs = pinMs - sourceCueMs / ratio
    const audible = layerAudibleFractions(layerLanes(catalog, layer.layer_id), stems)
      .map(([a, b]) => [
        Math.max(sourceStartMs, windowStartMs + a * (windowEndMs - windowStartMs)),
        windowStartMs + b * (windowEndMs - windowStartMs),
      ])
      .filter(([a, b]) => b > a)
    if (audible.length === 0) continue
    const toSetSeconds = (nativeMs) =>
      (backboneRow.startMs + (nativeMs - backboneRow.startNativeMs) * backboneRow.stretch) / 1000
    plays.push({
      row: `L${layer.layer_id}`,
      catalogTrack: source,
      artist: source.artist,
      title: source.title,
      startSeconds: toSetSeconds(audible[0][0]),
      endSeconds: toSetSeconds(audible[audible.length - 1][1]),
      tempoFactor: ratio / backboneRow.stretch,
      nativeSegmentsMs: audible.map(([a, b]) => [toSource(a), toSource(b)]),
      extra: { layer: true, stems: stems.join(',') || null, backboneRow: backboneRow.row },
    })
  }
  return plays
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  if (!args.catalog || !(args['render-id'] || args.timeline) || !args.output) {
    throw new Error(
      'usage: truth-from-akin.js --catalog=<path> (--render-id=<id> | --timeline=<file> --audio=<file>) --output=<file>',
    )
  }
  await assertReadOnly()
  let render
  if (args.timeline) {
    render = {
      render_id: null,
      file_path: args.audio || null,
      timeline_snapshot: fs.readFileSync(args.timeline, 'utf8'),
      set_name: args.timeline,
    }
  } else {
    const renderId = integerLiteral(args['render-id'])
    ;[render] = sqliteJson(
      args.catalog,
      `SELECT r.render_id, r.set_id, r.file_path, r.snapshot, r.timeline_snapshot, s.set_name
       FROM set_render r JOIN track_set s USING (set_id) WHERE r.render_id = ${renderId}`,
    )
    if (!render) throw new Error(`render ${renderId} not found`)
  }
  const timeline = JSON.parse(render.timeline_snapshot)

  const jumpsByRow = beatJumpsByRow(args.catalog, render.set_id)
  const spans = timeline.tracks.map((t) => {
    const [catalogTrack] = sqliteJson(
      args.catalog,
      `SELECT track_path, track_isrc FROM track WHERE track_id = ${integerLiteral(t.trackId)}`,
    )
    // The mix plays native audio 1 / stretch times as fast: a set second
    // covers 1 / stretch track seconds, which is the matcher's tempo factor.
    const tempoFactor = 1 / t.stretch
    const audibleMs = audibleSpanMs(t, timeline)
    // Before its start the track is silent.
    const startMs = Math.max(audibleMs.startMs, t.startMs - t.startNativeMs / tempoFactor)
    const { endMs } = audibleMs
    const toNative = (setMs) => t.startNativeMs + (setMs - t.startMs) * tempoFactor
    const editedMs = [toNative(startMs), toNative(endMs)]
    const jumps = jumpsByRow.get(t.row)
    const grid = jumps ? catalogGrid(args.catalog, t.trackId) : null
    return {
      row: t.row,
      catalogTrack: { ...catalogTrack, artist: t.artist, title: t.title },
      artist: t.artist,
      title: t.title,
      startSeconds: startMs / 1000,
      endSeconds: endMs / 1000,
      tempoFactor,
      nativeSegmentsMs: jumps ? editedToOriginal(editedMs, jumps, grid.bpm) : [editedMs],
      extra: jumps ? { beatJumps: jumps.length } : {},
    }
  })
  if (render.snapshot) spans.push(...layerPlays(args.catalog, render, timeline))

  const plays = []
  for (const span of spans) {
    const { row, artist, title, startSeconds, endSeconds, tempoFactor, nativeSegmentsMs } = span
    const trackIds = await trackIdsFor(span.catalogTrack)
    const previews = (await previewsFor(trackIds)).map((p) => ({
      previewId: p.preview_id,
      trackId: p.track_id,
      startSeconds: p.start_ms === null ? null : p.start_ms / 1000,
      endSeconds: p.end_ms === null ? null : p.end_ms / 1000,
      fingerprinted: p.fingerprinted,
    }))
    // Recognisable only where the played part of the track overlaps a
    // fingerprinted preview window.
    const overlapSeconds = Math.max(
      0,
      ...previews
        .filter((p) => p.fingerprinted && p.startSeconds !== null)
        .map((p) => overlapMs(nativeSegmentsMs, [p.startSeconds * 1000, p.endSeconds * 1000]) / 1000),
    )
    const toSeconds = (ms) => Math.round(ms) / 1000
    plays.push({
      row,
      artist,
      title,
      startSeconds,
      endSeconds,
      tempoFactor,
      // Where the play starts in the track (set time startSeconds) and the
      // original track ranges it plays, in playback order.
      nativeStartSeconds: toSeconds(nativeSegmentsMs[0][0]),
      nativeEndSeconds: toSeconds(nativeSegmentsMs[nativeSegmentsMs.length - 1][1]),
      nativeSegmentsSeconds: nativeSegmentsMs.map(([a, b]) => [toSeconds(a), toSeconds(b)]),
      trackIds,
      previews,
      previewOverlapSeconds: overlapSeconds,
      ...span.extra,
    })
  }

  const truth = {
    set: render.set_name,
    renderId: render.render_id,
    audioPath: render.file_path,
    durationSeconds: timeline.totalMs / 1000,
    plays,
  }
  fs.writeFileSync(args.output, JSON.stringify(truth, null, 1))
  for (const p of plays) {
    console.log(
      `${String(p.row).padStart(2)} ${p.startSeconds.toFixed(0).padStart(5)}–${p.endSeconds.toFixed(0).padEnd(5)} ` +
        `×${p.tempoFactor.toFixed(3)} overlap ${
          p.previewOverlapSeconds === null ? '  ?' : p.previewOverlapSeconds.toFixed(0).padStart(3)
        } s native ${p.nativeSegmentsSeconds.map(([a, b]) => `${a.toFixed(0)}–${b.toFixed(0)}`).join(',')} ` +
        `ids [${p.trackIds.join(',')}] ${p.artist} – ${p.title}`,
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
