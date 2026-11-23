#!/usr/bin/env bash
# Pause or resume the analyser workers of an analyse_all.sh tmux session.
#
#   analyser_pause.sh toggle <session>   create or remove the pause flag
#   analyser_pause.sh status <session>   print the workers' pause state
#
# The flag is analyser/.pause-<session>; analyse_all.sh exports its path to
# every window as ANALYSER_PAUSE_FILE. analyse_previews.py finishes the work
# already running, then idles until the flag is gone (writing "pausing: N
# running" / "paused" to <flag>.state); the window loops do not restart a
# worker while it exists. tmux runs this from the session's key binding and
# status-bar label, so plain `tmux` reaches the right server.
set -euo pipefail

usage() {
  echo "Usage: $(basename "$0") toggle|status <session>" >&2
  exit 1
}

[[ $# -eq 2 ]] || usage
command="$1"
session="$2"
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
flag="$dir/.pause-$session"

case "$command" in
  toggle)
    if [[ -e "$flag" ]]; then
      rm -f "$flag"
      tmux set-option -t "$session" @analyser_paused 0 2>/dev/null || true
    else
      : > "$flag"
      tmux set-option -t "$session" @analyser_paused 1 2>/dev/null || true
    fi
    tmux refresh-client -S 2>/dev/null || true
    ;;
  status)
    if [[ -e "$flag" ]]; then
      if [[ -s "$flag.state" ]]; then cat "$flag.state"; else echo "pausing"; fi
    fi
    ;;
  *)
    usage
    ;;
esac
