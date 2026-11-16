#!/usr/bin/env bash
set -euo pipefail

# Defaults
SESSION="analyser"
MODEL="discogs_multi_embeddings-effnet-bs64-1"
BATCH_SIZE=""
PREVIEWS=0
AUDIO_SAMPLES=0
PURCHASED=0
NO_ATTACH=0
NO_WAVEFORM=0
DIRECT_DOWNLOAD=0
IDLE_WAIT=""
SKIP_SANITY=0
SCORE_AFTER=""
FINGERPRINT_WORKERS=""
LAYOUT="windows"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--previews] [--audio-samples]
                       [--purchased]
                       [--batch-size N]
                       [--model NAME]
                       [--session NAME]
                       [--layout windows|panes]
                       [--no-waveform]
                       [--direct-download]
                       [--idle-wait SECONDS]
                       [--skip-sanity-confirmation]
                       [--score-after N]
                       [--fingerprint-workers N]
                       [--no-attach]

At least one of --previews or --audio-samples is required.

  --previews        Spawn fingerprint-previews, embedding-previews, waveform-previews workers.
  --audio-samples   Spawn fingerprint-samples worker.
  --purchased       Pass -p true to the embedding-previews worker.
  --batch-size N    Pass -b N to every spawned worker.
  --model NAME      Pass -m NAME to the embedding-previews worker.
                    Default: $MODEL
  --session NAME    tmux session name. Default: $SESSION
  --layout L        windows: one tmux window per worker (default).
                    panes:   all workers as tiled panes in a single 'workers' window.
  --no-waveform     Skip the waveform-previews worker (useful when MinIO env vars
                    are not configured).
  --direct-download Pass --direct-download to the preview workers: download
                    previews from the stores instead of only taking the ones
                    the backend's prefetchPreviewAudio job stored in the bucket.
                    For a backend without that job (e.g. local development).
  --idle-wait SECONDS
                    When a worker finds its queue empty, wait this long and ask
                    again instead of stopping. The backend adds prefetched audio
                    every 10 minutes, so an empty queue is usually temporary.
                    Default: 120, or 0 (stop when drained) with --direct-download.
  --skip-sanity-confirmation
                    Pass --skip-sanity-confirmation through to main.py so
                    embedding-collision warnings don't block on a y/N prompt.
                    Recommended for unattended runs.
  --score-after N   Pass --score-after N to fingerprint-previews so the worker
                    runs sample scoring (against ALL fingerprinted samples)
                    every N previews fingerprinted within one invocation. 0
                    disables. Effective only when batch-size >= N.
  --fingerprint-workers N
                    Pass --workers N to the fingerprint-previews worker only,
                    setting how many parallel processes fingerprint each fetched
                    batch. Omitted → the worker default (4) applies. Recommended
                    ceiling: cores − 1..2; use 1 to restore serial behaviour.
  --no-attach       Don't 'tmux attach' after launching.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --previews)       PREVIEWS=1; shift ;;
    --audio-samples)  AUDIO_SAMPLES=1; shift ;;
    --purchased)      PURCHASED=1; shift ;;
    --batch-size)     BATCH_SIZE="$2"; shift 2 ;;
    --model)          MODEL="$2"; shift 2 ;;
    --session)        SESSION="$2"; shift 2 ;;
    --layout)         LAYOUT="$2"; shift 2 ;;
    --no-waveform)    NO_WAVEFORM=1; shift ;;
    --direct-download) DIRECT_DOWNLOAD=1; shift ;;
    --idle-wait)      IDLE_WAIT="$2"; shift 2 ;;
    --skip-sanity-confirmation) SKIP_SANITY=1; shift ;;
    --score-after)    SCORE_AFTER="$2"; shift 2 ;;
    --fingerprint-workers) FINGERPRINT_WORKERS="$2"; shift 2 ;;
    --no-attach)      NO_ATTACH=1; shift ;;
    -h|--help)        usage; exit 0 ;;
    *)
      echo "Error: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$LAYOUT" != "windows" && "$LAYOUT" != "panes" ]]; then
  echo "Error: --layout must be 'windows' or 'panes', got '$LAYOUT'." >&2
  exit 1
fi

# Precondition checks
if ! command -v tmux >/dev/null 2>&1; then
  echo "Error: tmux is not on PATH. Install tmux to run the analyser orchestrator (e.g. 'brew install tmux' or 'apt install tmux')." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$SCRIPT_DIR/venv/bin/activate" ]]; then
  echo "Error: $SCRIPT_DIR/venv/bin/activate not found. Create the analyser virtualenv first (see analyser/README.md)." >&2
  exit 1
fi

if [[ -z "${FOMOPLAYER_API_URL:-}" ]]; then
  echo "Error: FOMOPLAYER_API_URL is not set. Export it (e.g. https://fomoplayer.com/api) before running the orchestrator." >&2
  exit 1
fi

if [[ $PREVIEWS -eq 0 && $AUDIO_SAMPLES -eq 0 ]]; then
  echo "Error: at least one of --previews or --audio-samples must be supplied." >&2
  usage >&2
  exit 1
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Error: tmux session '$SESSION' already exists. Use --session <other-name> or kill it with 'tmux kill-session -t $SESSION'." >&2
  exit 1
fi

# Build the per-window inner loop.
# `source venv/bin/activate` runs first, then the python worker is re-invoked
# until it signals empty queue (rc=2). Other non-zero rc triggers a 5s backoff.
if [[ -z "$IDLE_WAIT" ]]; then
  if [[ $DIRECT_DOWNLOAD -eq 1 ]]; then IDLE_WAIT=0; else IDLE_WAIT=120; fi
fi
if ! [[ "$IDLE_WAIT" =~ ^[0-9]+$ ]]; then
  echo "Error: --idle-wait must be a whole number of seconds, got '$IDLE_WAIT'" >&2
  exit 1
fi

# An empty queue (rc=2) either stops the loop (IDLE_WAIT=0) or waits IDLE_WAIT
# seconds and asks again: with prefetched audio the backend refills the queues
# every 10 minutes, so a worker that stopped would miss the new files.
make_loop() {
  local worker_cmd="$1"
  local on_empty
  if [[ "$IDLE_WAIT" -gt 0 ]]; then
    on_empty="echo \"[analyse_all] queue empty (rc=2), checking again in ${IDLE_WAIT}s...\"; sleep $IDLE_WAIT"
  else
    on_empty='echo "[analyse_all] queue drained (rc=2), stopping loop"; break'
  fi
  cat <<EOF
cd '$SCRIPT_DIR'
source venv/bin/activate
while :; do
  $worker_cmd
  rc=\$?
  case \$rc in
    0) ;;
    2) $on_empty ;;
    *) echo "[analyse_all] worker exited rc=\$rc, retrying in 5s..."; sleep 5 ;;
  esac
done
EOF
}

# Helper to build worker commands with optional flags.
batch_arg=""
if [[ -n "$BATCH_SIZE" ]]; then
  batch_arg=" -b $BATCH_SIZE"
fi

purchased_arg=""
if [[ $PURCHASED -eq 1 ]]; then
  purchased_arg=" -p true"
fi

direct_arg=""
if [[ $DIRECT_DOWNLOAD -eq 1 ]]; then
  direct_arg=" --direct-download"
fi

sanity_arg=""
if [[ $SKIP_SANITY -eq 1 ]]; then
  sanity_arg=" --skip-sanity-confirmation"
fi

score_after_arg=""
if [[ -n "$SCORE_AFTER" ]]; then
  score_after_arg=" --score-after $SCORE_AFTER"
fi

# Applies to the fingerprint-previews worker only; omitted → worker default (4).
fingerprint_workers_arg=""
if [[ -n "$FINGERPRINT_WORKERS" ]]; then
  fingerprint_workers_arg=" --workers $FINGERPRINT_WORKERS"
fi

# Spawn the first worker with new-session; subsequent workers either get their
# own window (--layout windows) or split the shared workers window (--layout panes).
session_created=0
WORKER_WINDOW="workers"   # used only by panes layout

spawn_window() {
  local window_name="$1"
  local worker_cmd="$2"
  local loop_script
  loop_script="$(make_loop "$worker_cmd")"

  if [[ $session_created -eq 0 ]]; then
    tmux new-session -d -s "$SESSION" -n "$window_name" "bash -c $(printf '%q' "$loop_script")"
    session_created=1
  else
    tmux new-window -t "$SESSION" -n "$window_name" "bash -c $(printf '%q' "$loop_script")"
  fi
  tmux set-option -w -t "$SESSION:$window_name" remain-on-exit on
}

spawn_pane() {
  local pane_name="$1"
  local worker_cmd="$2"
  local loop_script pane_id
  loop_script="$(make_loop "$worker_cmd")"

  if [[ $session_created -eq 0 ]]; then
    pane_id=$(tmux new-session -d -P -F '#{pane_id}' \
      -s "$SESSION" -n "$WORKER_WINDOW" \
      "bash -c $(printf '%q' "$loop_script")")
    session_created=1
    # Window-level cosmetics: show a title bar per pane so workers are identifiable.
    tmux set-option -w -t "$SESSION:$WORKER_WINDOW" remain-on-exit on
    tmux set-option -w -t "$SESSION:$WORKER_WINDOW" pane-border-status top
    tmux set-option -w -t "$SESSION:$WORKER_WINDOW" pane-border-format " #{pane_title} "
  else
    pane_id=$(tmux split-window -P -F '#{pane_id}' \
      -t "$SESSION:$WORKER_WINDOW" \
      "bash -c $(printf '%q' "$loop_script")")
    # Re-balance after each split so the next split divides a fresh region.
    tmux select-layout -t "$SESSION:$WORKER_WINDOW" tiled >/dev/null
  fi
  tmux select-pane -t "$pane_id" -T "$pane_name"
  # remain-on-exit moved to a pane option in tmux 3.2+; set it explicitly so the
  # pane stays visible after a drain regardless of tmux version.
  tmux set-option -p -t "$pane_id" remain-on-exit on 2>/dev/null || true
}

spawn() {
  if [[ "$LAYOUT" == "panes" ]]; then
    spawn_pane "$@"
  else
    spawn_window "$@"
  fi
}

if [[ $PREVIEWS -eq 1 ]]; then
  spawn "fingerprint-previews" "python panako_processor.py --previews${batch_arg}${score_after_arg}${fingerprint_workers_arg}${direct_arg}"
  # --loop keeps the model loaded across batches, and --idle-wait makes main.py
  # wait for the next prefetch run itself (model still loaded) instead of
  # exiting 2 and being restarted by the window loop.
  spawn "embedding-previews"   "python main.py --loop --idle-wait $IDLE_WAIT -m \"$MODEL\"${batch_arg}${purchased_arg}${sanity_arg}${direct_arg}"
  if [[ $NO_WAVEFORM -eq 0 ]]; then
    spawn "waveform-previews"  "python waveform.py${direct_arg}"
  fi
fi

if [[ $AUDIO_SAMPLES -eq 1 ]]; then
  spawn "fingerprint-samples" "python panako_processor.py --audio-samples${batch_arg}"
fi

if [[ "$LAYOUT" == "panes" ]]; then
  tmux select-layout -t "$SESSION:$WORKER_WINDOW" tiled >/dev/null
fi

# Enable mouse support for this session: click to select panes/windows, drag
# borders to resize, scroll wheel to enter copy-mode and scroll history, and
# drag to select text (copies to the tmux buffer on release). Scoped to this
# session so it doesn't depend on the user's ~/.tmux.conf.
tmux set-option -t "$SESSION" mouse on

if [[ $NO_ATTACH -eq 1 ]]; then
  echo "Session \"$SESSION\" started. Attach with: tmux attach -t $SESSION"
  exit 0
fi

exec tmux attach -t "$SESSION"
