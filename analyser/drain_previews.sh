#!/bin/bash
# Runs from the checkout the script lives in (a worktree works too); point
# ANALYSER_VENV at another checkout's venv to reuse it.
cd "$(dirname "$0")" || exit 1
source "${ANALYSER_VENV:-venv}/bin/activate"
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
: "${FOMOPLAYER_API_URL:?set FOMOPLAYER_API_URL to the API to fingerprint against}"
export FOMOPLAYER_API_URL
while true; do
  python panako_processor.py --previews -b 200 --workers 4 --score-after 0
  rc=$?
  if [ $rc -eq 2 ]; then echo DRAINED; break; fi
  if [ $rc -ne 0 ]; then echo "rc=$rc, retrying in 60s"; sleep 60; fi
done
echo loop-ended
