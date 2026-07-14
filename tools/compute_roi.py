#!/usr/bin/env python3
"""
compute_roi.py — find the "where the action is" crop rectangle for a clip.

The gallery clips are top-down sim renders with a lot of empty road. To make the
agents fill the frame we crop to the region that actually *moves* over the clip,
then expand that box to the gallery cell's aspect ratio (16:9 by default) so the
crop drops cleanly into the layout.

Method (temporal motion map):
  1. sample N frames evenly, convert to grayscale
  2. per-pixel motion = max - min across the sampled frames
  3. keep the central mass of that motion energy (drop the outer `--tail`
     fraction on each axis) → a tight motion bbox
  4. add a margin, expand to the target aspect ratio, clamp to the frame

Prints an ffmpeg crop string `W:H:X:Y` and the [x0,y0,x1,y1] box. Feed the crop
string straight into tools/encode_video.sh --crop.

Usage:
  tools/compute_roi.py IN.mp4 [--aspect 16:9] [--frames 48] [--margin 0.07]
                              [--tail 0.02] [--square] [--json]
"""
import argparse, json, subprocess, sys
import numpy as np
from PIL import Image
import io


def read_frames(path, n):
    # probe duration
    dur = float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "csv=p=0", path]).decode().strip())
    frames = []
    for i in range(n):
        t = dur * (i + 0.5) / n
        png = subprocess.check_output([
            "ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", path,
            "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"])
        frames.append(np.asarray(Image.open(io.BytesIO(png)).convert("L"), dtype=np.int16))
    return np.stack(frames)  # (n, H, W)


def motion_bbox(stack, tail):
    motion = stack.max(0) - stack.min(0)          # (H, W)
    col = motion.sum(0).astype(float)             # energy per column
    row = motion.sum(1).astype(float)             # energy per row

    def bounds(energy):
        c = np.cumsum(energy)
        total = c[-1] if c[-1] > 0 else 1.0
        lo = np.searchsorted(c, total * tail)
        hi = np.searchsorted(c, total * (1 - tail))
        return int(lo), int(hi)

    x0, x1 = bounds(col)
    y0, y1 = bounds(row)
    return x0, y0, x1, y1


def expand(box, W, H, margin, aspect, square):
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    bw *= (1 + 2 * margin)
    bh *= (1 + 2 * margin)
    if square:
        bw = bh = max(bw, bh)
    elif aspect:
        aw, ah = aspect
        target = aw / ah
        if bw / bh < target:
            bw = bh * target
        else:
            bh = bw / target
    x0 = int(round(cx - bw / 2)); x1 = int(round(cx + bw / 2))
    y0 = int(round(cy - bh / 2)); y1 = int(round(cy + bh / 2))
    # clamp, preserving size where possible
    if x0 < 0: x1 -= x0; x0 = 0
    if y0 < 0: y1 -= y0; y0 = 0
    if x1 > W: x0 -= (x1 - W); x1 = W
    if y1 > H: y0 -= (y1 - H); y1 = H
    x0, y0 = max(0, x0), max(0, y0)
    # ffmpeg needs even dimensions
    x1 -= (x1 - x0) % 2
    y1 -= (y1 - y0) % 2
    return x0, y0, x1, y1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--aspect", default="16:9", help="target aspect W:H, or 'none'")
    ap.add_argument("--frames", type=int, default=48)
    ap.add_argument("--margin", type=float, default=0.07)
    ap.add_argument("--tail", type=float, default=0.02)
    ap.add_argument("--square", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    aspect = None
    if a.aspect and a.aspect.lower() != "none":
        aw, ah = (float(v) for v in a.aspect.split(":"))
        aspect = (aw, ah)

    stack = read_frames(a.input, a.frames)
    _, H, W = stack.shape
    box = motion_bbox(stack, a.tail)
    x0, y0, x1, y1 = expand(box, W, H, a.margin, aspect, a.square)
    crop = f"{x1 - x0}:{y1 - y0}:{x0}:{y0}"
    if a.json:
        print(json.dumps({"crop_xyxy": [x0, y0, x1, y1], "ffmpeg_crop": crop}))
    else:
        print(crop, file=sys.stdout)
        print(f"# box=[{x0},{y0},{x1},{y1}]  frame={W}x{H}", file=sys.stderr)


if __name__ == "__main__":
    main()
