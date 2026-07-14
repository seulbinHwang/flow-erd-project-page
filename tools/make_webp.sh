#!/usr/bin/env bash
#
# make_webp.sh — build an animated-WebP "twin" of a clip.
#
# Why this exists: the target Safari blocks <video> autoplay on the live github.io
# origin, and it also plays an animated WebP only once. The page therefore ships a
# lightweight WebP next to every clip and loops it from JS (re-inserting a fresh
# <img> with a new object URL each cycle). This script produces that WebP.
#
# WebP is CPU-decoded, so keep it SMALL: downscale width and drop the frame rate.
# Quality/other is secondary to smoothness before the first user gesture.
#
# Usage:
#   tools/make_webp.sh IN.mp4 OUT.webp [--width W] [--fps N] [--q Q]
#
# Presets used for the current assets:
#   hero    :  --width 600 --fps 12 --q 72
#   gallery :  --width 600 --fps 16 --q 72
#
# After generating, note the clip duration in ms and set it on the <video> as
# data-anim-ms="<ms>" in index.html — the JS loop uses it so long clips (20s/40s)
# don't restart early. Bump the ?v=N on the .webp (index.html) and ANIM_VER (main.js).
#
set -euo pipefail

[ $# -ge 2 ] || { grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
IN=$1; OUT=$2; shift 2
WIDTH=600; FPS=12; Q=72
while [ $# -gt 0 ]; do
  case "$1" in
    --width) WIDTH=$2; shift 2;;
    --fps)   FPS=$2;   shift 2;;
    --q)     Q=$2;     shift 2;;
    *) echo "unknown option: $1" >&2; exit 1;;
  esac
done

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

ffmpeg -y -loglevel warning -i "$IN" \
  -vf "fps=${FPS},scale=${WIDTH}:-2:flags=lanczos" \
  "$TMP/f_%04d.png"

DELAY=$(python3 -c "print(int(round(1000/${FPS})))")   # per-frame ms
DUR_MS=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN" \
         | python3 -c "import sys;print(int(round(float(sys.stdin.read())*1000)))")

# -loop 0 = infinite (JS drives the real loop); -m 6 = best compression effort
img2webp -loop 0 -lossy -q "$Q" -m 6 -d "$DELAY" "$TMP"/f_*.png -o "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "→ $OUT  ${WIDTH}px ${FPS}fps  size=${SIZE}  clip=${DUR_MS}ms"
echo "  set data-anim-ms=\"${DUR_MS}\" on the matching <video> in index.html"
