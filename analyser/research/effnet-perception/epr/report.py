"""Aggregates and charts for FINDINGS.md.

summary.json (OUT/report/) holds every number the findings quote. Charts are PNGs written next to FINDINGS.md in
the OpenSpec change (aggregates only, no track names). Colours: the reference categorical palette, one fixed slot per
change group; names are always printed next to the marks, so colour is never the only identity.
"""
import csv
import json
from pathlib import Path

import numpy as np

from .config import out_path

CHART_DIR = Path(__file__).resolve().parents[4] / 'openspec' / 'changes' / 'effnet-perception-research' / 'findings'
GROUP_COLORS = {'control': '#2a78d6', 'tempo-key': '#eb6834', 'quality': '#1baf7a', 'mix': '#eda100',
                'structure': '#e87ba4', 'stems': '#6250d6', 'baseline': '#6b6a63'}
INK, MUTED, GRID = '#1f1f1e', '#6b6a63', '#e4e3dd'


def _csv(*parts):
    p = out_path(*parts)
    if not p.exists():
        return []
    with open(p, newline='') as f:
        return list(csv.DictReader(f))


def _style(ax):
    for side in ('top', 'right'):
        ax.spines[side].set_visible(False)
    for side in ('left', 'bottom'):
        ax.spines[side].set_color(GRID)
    ax.tick_params(which='both', colors=MUTED, labelsize=8)
    ax.grid(axis='x', color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)


def changes_summary():
    rows = _csv('changes', 'measures.csv')
    groups = {}
    for r in _csv('changes', 'results.csv') + _csv('changes-stems', 'results.csv'):
        groups[r['change']] = r['group']
    by = {}
    for r in rows:
        by.setdefault(r['change'], []).append(r)
    out = {}
    for name, rs in by.items():
        shift = np.array([float(r['shift']) for r in rs])
        dist = np.array([float(r['cos_dist']) for r in rs])
        out[name] = {'group': groups.get(name, 'stems'), 'tracks': len(rs),
                     'shift_median': round(float(np.median(shift)), 4),
                     'shift_p25': round(float(np.percentile(shift, 25)), 4),
                     'shift_p75': round(float(np.percentile(shift, 75)), 4),
                     'dist_median': round(float(np.median(dist)), 5),
                     'self_retrieval': round(float(np.mean([int(r['self_retrieved']) for r in rs])), 3)}
        sums = [float(r['dist_to_stem_sum']) for r in rs if r.get('dist_to_stem_sum') not in (None, '')]
        if sums:
            out[name]['dist_to_stem_sum_median'] = round(float(np.median(sums)), 5)
    statuses = {}
    for r in _csv('changes', 'results.csv'):
        statuses.setdefault(r['change'], {}).setdefault(r['status'].split(':')[0], 0)
        statuses[r['change']][r['status'].split(':')[0]] += 1
    return out, statuses


def swaps_summary():
    rows = _csv('swaps', 'results.csv')
    out = {}
    for layer in ('drums', 'bass', 'music'):
        pos = np.array([float(r['position']) for r in rows if r['layer'] == layer])
        if len(pos):
            out[layer] = {'pairs': len(pos), 'position_median': round(float(np.median(pos)), 3),
                          'position_p25': round(float(np.percentile(pos, 25)), 3),
                          'position_p75': round(float(np.percentile(pos, 75)), 3),
                          'share_nearer_donor': round(float(np.mean(pos > 0.5)), 3)}
    dhd = [float(r['d_host_donor']) for r in rows if r['layer'] == 'drums']
    if dhd:
        out['host_donor_distance_median'] = round(float(np.median(dhd)), 4)
    return out


def offsets_summary():
    rows = _csv('offsets', 'results.csv')
    out = {}
    loss = [float(r['d_to_unshifted']) for r in rows if r['offset'] == 'separation-loss']
    if loss:
        out['separation_loss_median'] = round(float(np.median(loss)), 5)
        out['separation_residual_db_median'] = round(float(np.median(
            [float(r['residual_db']) for r in rows if r['offset'] == 'separation-loss'])), 2)
    for r in rows:
        if r['offset'] == 'separation-loss':
            continue
        out.setdefault(f"{r['layer']}/{r['offset']}", []).append(float(r['d_to_unshifted']))
    for k, v in list(out.items()):
        if isinstance(v, list):
            out[k] = {'tracks': len(v), 'median': round(float(np.median(v)), 5),
                      'p75': round(float(np.percentile(v, 75)), 5)}
    return out


def chart_representations(rows, path):
    import matplotlib.pyplot as plt
    rows = sorted(rows, key=lambda r: float(r['top10_overlap_mean']))
    fig, ax = plt.subplots(figsize=(7, 0.28 * len(rows) + 1.2), dpi=150)
    y = np.arange(len(rows))
    vals = [float(r['top10_overlap_mean']) for r in rows]
    ax.barh(y, vals, height=0.6, color='#2a78d6')
    for yi, v, r in zip(y, vals, rows):
        ax.text(v + 0.1, yi, f"{v:.1f}  (ρ {float(r['spearman']):.2f})", va='center', fontsize=7, color=INK)
    ax.axvline(7, color=MUTED, linewidth=1, linestyle='--')
    ax.text(7.05, len(rows) - 0.4, 'unit threshold', fontsize=7, color=MUTED)
    ax.set_yticks(y, [r['representation'] for r in rows], fontsize=8, color=INK)
    ax.set_xlim(0, 11)
    ax.set_xlabel('top-10 neighbours shared with the full-track mean (of 10)', fontsize=8, color=MUTED)
    _style(ax)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def chart_changes(summary, path):
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D
    items = sorted(((k, v) for k, v in summary.items() if k != 'none'), key=lambda kv: kv[1]['shift_median'])
    fig, ax = plt.subplots(figsize=(7.5, 0.22 * len(items) + 1.4), dpi=150)
    for yi, (k, v) in enumerate(items):
        c = GROUP_COLORS.get(v['group'], MUTED)
        lo, hi = max(v['shift_p25'], 1e-4), max(v['shift_p75'], 1e-4)
        ax.plot([lo, hi], [yi, yi], color=c, linewidth=2, solid_capstyle='round')
        ax.plot(max(v['shift_median'], 1e-4), yi, 'o', markersize=5, color=c, markeredgecolor='white',
                markeredgewidth=1)
        if v['shift_p75'] == 0:  # identical embedding; the log axis cannot show 0
            ax.text(1.3e-4, yi, '0 (identical)', va='center', fontsize=6.5, color=MUTED)
        ax.text(12, yi, f"{v['self_retrieval'] * 100:.0f}%", va='center', fontsize=6.5, color=MUTED)
    ax.set_xscale('log')
    ax.set_xlim(1e-4, 20)
    ax.axvline(1, color=MUTED, linewidth=1, linestyle='--')
    ax.text(12, len(items) - 0.2, 'finds\noriginal', fontsize=6.5, color=MUTED, ha='left')
    ax.set_yticks(range(len(items)), [k for k, _ in items], fontsize=7, color=INK)
    ax.set_ylim(-0.8, len(items) + 0.8)
    ax.set_xlabel('normalised shift: median and interquartile range (log scale)\n'
                  "dashed line = the distance to the track's 10th nearest neighbour", fontsize=8, color=MUTED)
    handles = [Line2D([0], [0], marker='o', color=c, linewidth=2, label=g) for g, c in GROUP_COLORS.items()
               if any(v['group'] == g for _, v in items)]
    ax.legend(handles=handles, loc='lower center', bbox_to_anchor=(0.45, 1.0), ncol=len(handles), fontsize=7,
              frameon=False)
    _style(ax)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def chart_swaps(path):
    import matplotlib.pyplot as plt
    rows = _csv('swaps', 'results.csv')
    if not rows:
        return
    layers = ('drums', 'bass', 'music')
    fig, ax = plt.subplots(figsize=(6, 2.6), dpi=150)
    rng = np.random.default_rng(0)
    for i, layer in enumerate(layers):
        pos = np.array([float(r['position']) for r in rows if r['layer'] == layer])
        ax.scatter(pos, i + rng.uniform(-0.18, 0.18, len(pos)), s=8, color=GROUP_COLORS['stems'], alpha=0.45,
                   linewidths=0)
        ax.plot([np.median(pos)] * 2, [i - 0.3, i + 0.3], color=INK, linewidth=2)
        ax.text(1.02, i, f'median {np.median(pos):.2f}', va='center', fontsize=7, color=INK)
    ax.axvline(0.5, color=MUTED, linewidth=1, linestyle='--')
    ax.set_yticks(range(3), [f'{l} swapped' for l in layers], fontsize=8, color=INK)
    ax.set_xlim(0, 1.2)
    ax.set_xticks([0, 0.25, 0.5, 0.75, 1], ['host', '', 'halfway', '', 'donor'])
    ax.set_xlabel('where the mashup lands between the host and the donor', fontsize=8, color=MUTED)
    _style(ax)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def chart_offsets(summary, path):
    import matplotlib.pyplot as plt
    offs = ('1/16', 'beat', 'bar', '37ms')
    layers = ('drums', 'bass', 'music')
    if 'separation_loss_median' not in summary:
        return
    fig, ax = plt.subplots(figsize=(6, 2.6), dpi=150)
    colors = {'drums': '#2a78d6', 'bass': '#eb6834', 'music': '#1baf7a'}
    for j, layer in enumerate(layers):
        xs = [i + (j - 1) * 0.22 for i in range(len(offs))]
        ys = [summary.get(f'{layer}/{o}', {}).get('median', np.nan) for o in offs]
        ax.plot(xs, ys, 'o', color=colors[layer], markersize=6, markeredgecolor='white', label=layer)
    ax.axhline(summary['separation_loss_median'], color=MUTED, linestyle='--', linewidth=1)
    ax.text(3.45, summary['separation_loss_median'], 'separation loss', fontsize=7, color=MUTED, va='bottom',
            ha='right')
    ax.set_yscale('log')
    ax.set_xticks(range(len(offs)), ['1/16 note', '1 beat', '1 bar', '37 ms (off grid)'], fontsize=8)
    ax.set_ylabel('distance to unshifted\n(median)', fontsize=8, color=MUTED)
    ax.legend(fontsize=7, frameon=False, ncol=3, loc='lower center', bbox_to_anchor=(0.5, 1.0))
    _style(ax)
    ax.grid(axis='y', color=GRID, linewidth=0.6)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def chart_correlations(report, path):
    import matplotlib.pyplot as plt
    f = report['factors']
    fig, axes = plt.subplots(1, 2, figsize=(7, 2.4), dpi=150, sharey=True)
    for ax, key, label in ((axes[0], 'bpm_diff', 'tempo difference (%, half/double folded)'),
                           (axes[1], 'key_dist', 'Camelot key distance')):
        bins = f[key].get('bins', [])
        xs = [f"{b['from']:g}–{b['to']:g}" if key == 'bpm_diff' else f"{b['from']:g}" for b in bins]
        ax.bar(range(len(bins)), [b['median_dist'] for b in bins], width=0.6, color='#2a78d6')
        ax.set_xticks(range(len(bins)), xs, fontsize=7, rotation=0 if key == 'key_dist' else 30)
        ax.set_xlabel(label, fontsize=8, color=MUTED)
        _style(ax)
        ax.grid(axis='y', color=GRID, linewidth=0.6)
        ax.grid(axis='x', visible=False)
    axes[0].set_ylabel('median cosine distance', fontsize=8, color=MUTED)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def run(chart_dir=CHART_DIR):
    import matplotlib
    matplotlib.use('Agg')
    chart_dir.mkdir(parents=True, exist_ok=True)
    reps = _csv('representations', 'results.csv')
    ch, statuses = changes_summary()
    sw, of = swaps_summary(), offsets_summary()
    corr_path = out_path('correlations', 'report.json')
    corr = json.loads(corr_path.read_text()) if corr_path.exists() else None
    unit_path = out_path('representations', 'unit.json')
    summary = {'unit': json.loads(unit_path.read_text()) if unit_path.exists() else None,
               'representations': reps, 'changes': ch, 'change_statuses': statuses, 'swaps': sw, 'offsets': of,
               'correlations': corr}
    for step in ('sample', 'embed-full', 'loudness', 'representations', 'reference', 'changes', 'changes-stems',
                 'stems', 'swaps', 'offsets', 'style', 'correlations'):
        p = out_path(step, 'summary.json')
        if p.exists():
            summary.setdefault('steps', {})[step] = json.loads(p.read_text())
    out_path('report', 'summary.json').write_text(json.dumps(summary, indent=2, default=str))
    if reps:
        chart_representations(reps, chart_dir / 'representations.png')
    if ch:
        chart_changes(ch, chart_dir / 'changes.png')
    chart_swaps(chart_dir / 'swaps.png')
    chart_offsets(of, chart_dir / 'offsets.png')
    if corr:
        chart_correlations(corr, chart_dir / 'correlations.png')
    print(f'[report] summary {out_path("report", "summary.json")}; charts in {chart_dir}')
    return 0
