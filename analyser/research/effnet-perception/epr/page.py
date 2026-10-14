"""The local listening page: OUT/page/index.html with FLAC clips under OUT/page/audio/.

Sections: audio changes (original next to each change), stem swaps (host, donor, mashups), stem offsets, and Part 1's
largest disagreements (a track and the neighbour a representation ranks first, which the mean ranks far away).
Each list auto-advances: when a clip ends, the next one in the same list plays. The page plays local files, so it is
opened from disk (or any static server), not published.
"""
import csv
import html
import json
import subprocess

from . import sample
from .config import out_path

PAGE_REPRESENTATIONS = ('median', 'section-30s-typical', 'phrases-16bar', 'kmeans-4', 'style-400',
                        'stems-equal-weights', 'stems-drums+bass')
DISAGREEMENTS_PER_REP = 4


def _csv(*parts):
    p = out_path(*parts)
    return list(csv.DictReader(open(p, newline=''))) if p.exists() else []


def _flac(src, rel):
    dst = out_path('page', 'audio', rel)
    if not dst.exists():
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-sample_fmt', 's16', str(dst)], check=True)
    return f'audio/{rel}'


def _cut(track, start, seconds, rel):
    dst = out_path('page', 'audio', rel)
    if not dst.exists():
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.3f}', '-t', str(seconds), '-i',
                        track['track_path'], '-sample_fmt', 's16', '-ar', '44100', str(dst)], check=True)
    return f'audio/{rel}'


def _name(t):
    return f"{t.get('track_artist') or '?'} – {t.get('track_title') or '?'}"


def _clip(src, label, sub=''):
    return (f'<li><span class="label">{html.escape(label)}</span><span class="sub">{html.escape(sub)}</span>'
            f'<audio controls preload="none" src="{html.escape(src)}"></audio></li>')


def changes_section(by_id, measures):
    base = out_path('page-audio', 'changes', 'x').parent
    if not base.exists():
        return ''
    parts = ['<h2>Audio changes</h2><p class="lede">Each list starts with the original unit. The number is the '
             "normalised shift: 1.0 moves the track as far as its own 10th nearest neighbour.</p>"]
    for d in sorted(base.iterdir(), key=lambda p: p.name):
        if not d.is_dir() or not d.name.isdigit():
            continue
        t = by_id.get(int(d.name))
        if not t:
            continue
        m = {(r['change']): r for r in measures if r['track_id'] == d.name}
        items = []
        files = sorted(d.glob('*.wav'), key=lambda p: (float(m.get(p.stem, {}).get('shift', 0) or 0), p.stem))
        for f in files:
            r = m.get(f.stem, {})
            sub = f"shift {float(r['shift']):.3f}" if r else ''
            items.append(_clip(_flac(f, f'changes/{d.name}/{f.stem}.flac'), f.stem, sub))
        parts.append(f'<section><h3>{html.escape(_name(t))}</h3><ol class="list">{"".join(items)}</ol></section>')
    return ''.join(parts)


def swaps_section(by_id):
    base = out_path('page-audio', 'swaps', 'x').parent
    rows = _csv('swaps', 'results.csv')
    if not base.exists():
        return ''
    parts = ['<h2>Stem swaps</h2><p class="lede">The host keeps its other stems; one layer comes from the donor '
             '(tempo-matched, bar-aligned, level-matched). Position 0 = the mashup sounds like the host to the model, '
             '1 = like the donor.</p>']
    for d in sorted(base.iterdir(), key=lambda p: p.name):
        if not d.is_dir() or '-' not in d.name:
            continue
        h, dn = (int(x) for x in d.name.split('-'))
        if h not in by_id or dn not in by_id:
            continue
        pos = {r['layer']: r['position'] for r in rows if r['host_id'] == str(h) and r['donor_id'] == str(dn)}
        items = [_clip(_flac(d / 'host.wav', f'swaps/{d.name}/host.flac'), 'host', _name(by_id[h]))]
        for layer in ('drums', 'bass', 'music'):
            if (d / f'mashup-{layer}.wav').exists():
                items.append(_clip(_flac(d / f'mashup-{layer}.wav', f'swaps/{d.name}/mashup-{layer}.flac'),
                                   f'donor {layer}', f"position {pos.get(layer, '?')}"))
        if (d / 'donor-drums.wav').exists():
            items.append(_clip(_flac(d / 'donor-drums.wav', f'swaps/{d.name}/donor.flac'), 'donor',
                               _name(by_id[dn])))
        parts.append(f'<section><h3>{html.escape(_name(by_id[h]))} ← {html.escape(_name(by_id[dn]))}</h3>'
                     f'<ol class="list">{"".join(items)}</ol></section>')
    return ''.join(parts)


def offsets_section(by_id):
    base = out_path('page-audio', 'offsets', 'x').parent
    rows = _csv('offsets', 'results.csv')
    if not base.exists():
        return ''
    parts = ['<h2>Stem offsets</h2><p class="lede">One layer delayed against the others. The number is the distance '
             'to the unshifted recombination.</p>']
    for d in sorted(base.iterdir(), key=lambda p: p.name):
        if not d.is_dir() or not d.name.isdigit() or int(d.name) not in by_id:
            continue
        dist = {(r['layer'], r['offset'].replace('/', '_')): r['d_to_unshifted'] for r in rows
                if r['track_id'] == d.name}
        items = [_clip(_flac(d / 'unshifted.wav', f'offsets/{d.name}/unshifted.flac'), 'unshifted')]
        for f in sorted(d.glob('*.wav')):
            if f.stem == 'unshifted':
                continue
            layer, off = f.stem.split('-', 1)
            items.append(_clip(_flac(f, f'offsets/{d.name}/{f.stem}.flac'), f'{layer} delayed {off.replace("_", "/")}',
                               f"distance {dist.get((layer, off), '?')}"))
        parts.append(f'<section><h3>{html.escape(_name(by_id[int(d.name)]))}</h3>'
                     f'<ol class="list">{"".join(items)}</ol></section>')
    return ''.join(parts)


def disagreements_section(by_id):
    rows = _csv('representations', 'disagreements.csv')
    starts_p = out_path('representations', 'section-starts', '30s-typical.json')
    if not rows or not starts_p.exists():
        return ''
    starts = json.loads(starts_p.read_text())
    parts = ['<h2>Where representations disagree with the mean</h2><p class="lede">A track and the neighbour a '
             'representation ranks first, which the mean ranks far away. Clips are each track\'s most typical 30 s.'
             '</p>']
    for rep in PAGE_REPRESENTATIONS:
        rs = [r for r in rows if r['representation'] == rep][:DISAGREEMENTS_PER_REP]
        if not rs:
            continue
        items = []
        for r in rs:
            a, b = by_id.get(int(r['track_id'])), by_id.get(int(r['neighbour_id']))
            if not a or not b:
                continue
            for t, role in ((a, 'track'), (b, f"its {rep} neighbour (mean rank {r['mean_rank']})")):
                tid = t['track_id']
                items.append(_clip(_cut(t, float(starts.get(str(tid), 0)), 30, f'tracks/{tid}.flac'), _name(t), role))
        parts.append(f'<section><h3>{html.escape(rep)}</h3><ol class="list">{"".join(items)}</ol></section>')
    return ''.join(parts)


STYLE = """
:root{--bg:#f7f6f2;--fg:#1f1f1e;--muted:#6b6a63;--line:#e4e3dd;--accent:#2a78d6;--card:#ffffff}
@media (prefers-color-scheme:dark){:root{--bg:#1a1a19;--fg:#f0efec;--muted:#a9a89f;--line:#33322f;
--accent:#3987e5;--card:#232321;color-scheme:dark}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,system-ui,sans-serif;margin:0;
padding:24px 16px 64px}
main{max-width:860px;margin:0 auto}
h1{font-size:26px;margin:0 0 4px;text-wrap:balance}
h2{font-size:19px;margin:40px 0 4px;border-top:1px solid var(--line);padding-top:24px}
h3{font-size:14px;margin:20px 0 6px;font-weight:600}
.lede{color:var(--muted);margin:0 0 8px;max-width:65ch}
nav a{color:var(--accent);margin-right:14px;font-size:14px}
.list{list-style:none;padding:0;margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px}
.list li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:8px 12px;
border-top:1px solid var(--line);align-items:center}
.list li:first-child{border-top:0}
.label{font-variant-numeric:tabular-nums;font-size:13px}
.sub{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;grid-column:1}
audio{grid-row:1/span 2;grid-column:2;height:32px;max-width:100%}
li.playing{background:color-mix(in srgb,var(--accent) 10%,transparent)}
@media (max-width:560px){.list li{grid-template-columns:1fr}audio{grid-row:auto;grid-column:1;width:100%}}
"""

SCRIPT = """
document.querySelectorAll('.list').forEach(list => {
  const players = [...list.querySelectorAll('audio')];
  players.forEach((a, i) => {
    a.addEventListener('play', () => {
      document.querySelectorAll('audio').forEach(o => { if (o !== a) o.pause(); });
      document.querySelectorAll('li.playing').forEach(li => li.classList.remove('playing'));
      a.closest('li').classList.add('playing');
    });
    a.addEventListener('ended', () => { const next = players[i + 1]; if (next) next.play(); });
  });
});
"""


def run():
    tracks = sample.read('part1')
    by_id = {t['track_id']: t for t in tracks}
    measures = _csv('changes', 'measures.csv')
    body = (changes_section(by_id, measures) + swaps_section(by_id) + offsets_section(by_id) +
            disagreements_section(by_id))
    doc = (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" '
           f'content="width=device-width,initial-scale=1"><title>EffNet listening</title><style>{STYLE}</style>'
           f'</head><body><main><h1>What EffNet hears</h1><p class="lede">Listening examples for the '
           f'effnet-perception-research findings.</p><nav><a href="#changes">Changes</a><a href="#swaps">Swaps</a>'
           f'<a href="#offsets">Offsets</a><a href="#disagreements">Disagreements</a></nav>{body}</main>'
           f'<script>{SCRIPT}</script></body></html>')
    doc = (doc.replace('<h2>Audio changes', '<h2 id="changes">Audio changes')
              .replace('<h2>Stem swaps', '<h2 id="swaps">Stem swaps')
              .replace('<h2>Stem offsets', '<h2 id="offsets">Stem offsets')
              .replace('<h2>Where', '<h2 id="disagreements">Where'))
    path = out_path('page', 'index.html')
    path.write_text(doc)
    print(f'[page] {path}')
    return 0
