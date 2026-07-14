#!/usr/bin/env bash
#
# make_poster.sh — grab a single poster frame (shown before a video plays).
#
# Usage:
#   tools/make_poster.sh IN.mp4 OUT.jpg [--t SECONDS] [--q Q]
#     --t  timestamp to grab (default 0.5)
#     --q  JPEG quality, 2=best .. 31=worst (default 3)
#
# Note: -update 1 is required so ffmpeg writes a single image instead of
# expecting a %d sequence pattern in the filename.
#
set -euo pipefail

[ $# -ge 2 ] || { grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
IN=$1; OUT=$2; shift 2
T=0.5; Q=3
while [ $# -gt 0 ]; do
  case "$1" in
    --t) T=$2; shift 2;;
    --q) Q=$2; shift 2;;
    *) echo "unknown option: $1" >&2; exit 1;;
  esac
done

ffmpeg -y -loglevel warning -ss "$T" -i "$IN" -frames:v 1 -update 1 -q:v "$Q" "$OUT"
echo "→ $OUT  (t=${T}s)"
