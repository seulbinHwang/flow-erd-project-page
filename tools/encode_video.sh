#!/usr/bin/env bash
#
# encode_video.sh — encode a source clip into a web-ready MP4 for the project page.
#
# What it guarantees (all learned the hard way, see tools/README.md):
#   * H.264 / yuv420p           → plays everywhere, hardware-decoded (smooth)
#   * -movflags +faststart      → moov atom at the front, so playback can start
#                                 before the whole file is downloaded
#   * CRF + capped bitrate      → good quality without a fat file that stutters
#                                 while it buffers
#   * optional crop + scale     → tighten the region of interest, cap resolution
#
# Usage:
#   tools/encode_video.sh IN.mp4 OUT.mp4 [options]
#
# Options (with the defaults actually used on the page):
#   --height  H     output height, width auto (even). default 1080
#   --fps     N     force frame rate (omit to keep source)
#   --crf     N     x264 quality, lower = better. default 21
#   --maxrate R     bitrate ceiling, e.g. 2.5M. default 3M
#   --bufsize R     rate-control buffer. default = 2x maxrate
#   --crop  W:H:X:Y ffmpeg crop (applied BEFORE scale), in source pixels
#
# Presets used for the current assets:
#   hero    :  --height 1080 --fps 30 --crf 21 --maxrate 3M
#   gallery :  --height 720  --fps 20 --crf 20 --maxrate 2M --crop <ROI>
#
set -euo pipefail

[ $# -ge 2 ] || { grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
IN=$1; OUT=$2; shift 2

HEIGHT=1080; FPS=""; CRF=21; MAXRATE=3M; BUFSIZE=""; CROP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --height)  HEIGHT=$2; shift 2;;
    --fps)     FPS=$2;    shift 2;;
    --crf)     CRF=$2;    shift 2;;
    --maxrate) MAXRATE=$2;shift 2;;
    --bufsize) BUFSIZE=$2;shift 2;;
    --crop)    CROP=$2;   shift 2;;
    *) echo "unknown option: $1" >&2; exit 1;;
  esac
done
[ -n "$BUFSIZE" ] || BUFSIZE=$(python3 -c "u='${MAXRATE}'.upper().rstrip('M');print(f'{float(u)*2:g}M')")

vf=""
[ -n "$CROP" ] && vf="crop=${CROP},"
vf="${vf}scale=-2:${HEIGHT}:flags=lanczos"
[ -n "$FPS" ] && vf="${vf},fps=${FPS}"

echo "→ $OUT  (h=${HEIGHT} crf=${CRF} maxrate=${MAXRATE} fps=${FPS:-src} crop=${CROP:-none})"
ffmpeg -y -loglevel warning -i "$IN" -an \
  -vf "$vf" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -crf "$CRF" -maxrate "$MAXRATE" -bufsize "$BUFSIZE" \
  -movflags +faststart \
  "$OUT"

# sanity: confirm moov is before mdat (faststart really applied)
python3 - "$OUT" <<'PY'
import sys
d=open(sys.argv[1],'rb').read(300000)
mo,md=d.find(b'moov'),d.find(b'mdat')
print(f"  faststart={'OK' if 0<=mo<md else 'FAIL'}  moov@{mo} mdat@{md}")
PY
