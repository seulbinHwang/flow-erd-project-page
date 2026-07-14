# tools/ — media pipeline for the project page

The scripts that turn raw Flow-ERD simulation renders into the web-ready videos,
looping WebP fallbacks, poster frames, and promo images used on the page and for
paper promotion. macOS + Homebrew assumed.

## Requirements

```bash
brew install ffmpeg webp        # ffmpeg, ffprobe, img2webp, webpmux
python3 -m pip install pillow numpy
```

## The clip pipeline (raw render → shipped asset)

For each clip you go raw MP4 → (optional ROI crop) → web MP4 → WebP twin → poster.

```bash
# 1. (gallery only) find the crop that frames the moving agents, 16:9
CROP=$(tools/compute_roi.py raw/signal_complex_2.mp4 --aspect 16:9)

# 2. encode the web-ready MP4  (faststart + capped bitrate = smooth, no stutter)
#    hero (no crop, 1080p):
tools/encode_video.sh raw/hero_two_worlds.mp4 static/videos/hero_two_worlds.mp4 \
    --height 1080 --fps 30 --crf 21 --maxrate 3M
#    gallery (crop + 720p):
tools/encode_video.sh raw/signal_complex_2.mp4 static/videos/signal_complex_2.mp4 \
    --height 720 --fps 20 --crf 20 --maxrate 2M --crop "$CROP"

# 3. animated-WebP twin (autoplay fallback for Safari — see below)
tools/make_webp.sh static/videos/hero_two_worlds.mp4 static/anim/hero_two_worlds.webp \
    --width 600 --fps 12          # gallery: --fps 16

# 4. poster frame
tools/make_poster.sh static/videos/signal_complex_2.mp4 \
    static/posters/signal_complex_2.jpg --t 0.5
```

Then in `index.html` bump the `?v=N` on the changed `videos/`, `posters/`, `anim/`
files, set `data-anim-ms="<clip ms>"` on the `<video>` (printed by `make_webp.sh`),
and bump `ANIM_VER` in `static/js/main.js`. Commit, push, verify on the live site.

`crops.json` holds the exact ROI rectangles actually shipped for the gallery clips.

## Why it's built this way (hard-won constraints)

- **`-movflags +faststart`** — without it the `moov` atom lands at the end of the
  file and playback can't start until the whole thing downloads (10s+ stall).
- **Capped bitrate + modest resolution** — a fat stream stutters while it buffers.
  Smoothness beats sharpness; heroes are 1080p @ ≤3 Mbps, gallery 720p @ ≤2 Mbps.
- **Animated-WebP twin** — the target Safari blocks `<video>` autoplay on the
  github.io origin *and* plays an animated WebP only once. The page shows a small
  WebP immediately (JS loops it by re-inserting a fresh `<img>` per cycle) and
  upgrades to the real hardware-decoded MP4 on the first user gesture. WebP is
  CPU-decoded, so keep it small (low width + fps).
- **No panning/dynamic crops** — static crops only; a crop where every pixel moves
  each frame looks stuttery and inflates the WebP.

## Promo images (LinkedIn / social)

Compose title-over-frame images in the page palette:

```bash
# grab any still first, e.g. tools/make_poster.sh static/videos/signal_complex_2.mp4 frame.png --t 2
tools/make_promo_image.py --frame frame.png --kind share --size 1600x900 --out share_1600x900.png
tools/make_promo_image.py --frame frame.png --kind banner-cover   --out banner_cover.png
tools/make_promo_image.py --frame frame.png --kind banner-profile --out banner_profile.png
```

- `share` — 16:9 post / link-preview (OG) image (also 1200x675).
- `banner-cover` — 1584×396, text left; profile top banner or post.
- `banner-profile` — 1584×396, text right / image left, so the profile avatar
  (bottom-left) covers only the image, never the text.

Copy for the title lives at the top of `make_promo_image.py` (`TITLE`, `EYEBROW`,
`SUBTITLE`).
