#!/usr/bin/env bash
# Runs every step in order. Each step skips finished items, so rerunning after an interruption resumes.
# Stems (GPU) run beside the CPU steps; everything is niced so it yields to Traktor and the analyser jobs.
set -u
cd "$(dirname "$0")"
PY=".venv/bin/python"
OUT="${EPR_OUT:-/Volumes/DJ/research/effnet-perception}"
W="${EPR_WORKERS:-3}"
log() { echo "[$(date '+%H:%M:%S')] $*"; }
run() { log "step $*"; nice -n 10 "$PY" -m epr "$@" 2>&1 | grep -v -E 'absl::|mlir_graph|^I0000|^WARNING: All|No network created'; }

[ -f "$OUT/catalog/snapshot.sqlite" ] || run snapshot
[ -f "$OUT/sample/part1.csv" ] || run sample
run embed-full --workers "$W"
run representations --workers "$W"        # picks the Part 2 unit (representations/unit.json)

( run stems && run swaps --workers 2 && run offsets --workers 2 ) > "$OUT/stems-chain.log" 2>&1 &
STEMS_PID=$!
run style --workers 2
run changes --workers 2
run correlations
wait "$STEMS_PID"
cat "$OUT/stems-chain.log"
run changes --workers "$W"               # picks up the stem changes for tracks separated meanwhile
run representations --workers "$W"      # again, now with the style and stem representations
run report
run page
log "all steps finished"
