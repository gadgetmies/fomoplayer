"""Paths for the research run. Everything the run writes goes under OUT (see out_path)."""
import os
from pathlib import Path

OUT = Path(os.environ.get('EPR_OUT', '/Volumes/DJ/research/effnet-perception')).resolve()
CATALOG = Path(os.environ.get('EPR_CATALOG', '/Volumes/DJ/AKIN/tracks.akincatalog'))
# analyser/models, three levels above this package
MODELS = Path(os.environ.get('EPR_MODELS', Path(__file__).resolve().parents[3] / 'models'))

EFFNET_GRAPH = MODELS / 'discogs_multi_embeddings-effnet-bs64-1.pb'
# Optional, fetched under its own licence terms into the output directory (never committed); it outputs the 400
# Discogs style probabilities directly (PartitionedCall:0).
STYLE_GRAPH = OUT / 'models' / 'discogs-effnet-bs64-1.pb'
STYLE_LABELS = OUT / 'models' / 'discogs-effnet-bs64-1.json'

SR = 16000
# EffNet patches: 128 mel frames, hop 62 frames, 256-sample frame hop at 16 kHz
PATCH_SECONDS = 128 * 256 / SR
PATCH_HOP_SECONDS = 62 * 256 / SR

SEED = int(os.environ.get('EPR_SEED', '0'))


class OutsideOutputDirectory(Exception):
    pass


def out_path(*parts, mkdir_parent=True):
    """A path under OUT. Raises for anything that would land outside it."""
    p = OUT.joinpath(*[str(x) for x in parts]).resolve()
    if p != OUT and OUT not in p.parents:
        raise OutsideOutputDirectory(str(p))
    if mkdir_parent:
        p.parent.mkdir(parents=True, exist_ok=True)
    return p
