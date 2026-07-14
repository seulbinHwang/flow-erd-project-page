# Flow-ERD — Project Page

Project page for **"Flow-ERD: Agent-type Aware Flow Matching with Entropy-Regularized
Distillation for Diverse Traffic Simulation"**.

Static site: `index.html` + `static/` (CSS, JS, videos, poster frames). No build step.

## Preview locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Live: https://seulbinhwang.github.io/flow-erd-project-page/ · Paper: https://arxiv.org/abs/2607.06957

## Media pipeline

The scripts that produce the page's videos, looping WebP fallbacks, poster frames,
and the LinkedIn/social promo images live in [`tools/`](tools/) — see
[`tools/README.md`](tools/README.md) for the full walkthrough. Quick reference:

```bash
# raw render → web MP4 (faststart + capped bitrate)     hero: --height 1080 --fps 30
tools/encode_video.sh raw.mp4 static/videos/clip.mp4 --height 720 --fps 20 --crf 20 \
    --maxrate 2M --crop "$(tools/compute_roi.py raw.mp4 --aspect 16:9)"
# looping WebP twin (Safari autoplay fallback) + poster
tools/make_webp.sh   static/videos/clip.mp4 static/anim/clip.webp --width 600 --fps 16
tools/make_poster.sh static/videos/clip.mp4 static/posters/clip.jpg --t 0.5

# promo images (post/OG + profile banners), title over a sim frame
tools/make_poster.sh static/videos/signal_complex_2.mp4 frame.png --t 2
tools/make_promo_image.py --frame frame.png --kind share --size 1600x900 --out share.png
```

After changing an asset, bump its `?v=N` in `index.html` (and `ANIM_VER` in
`static/js/main.js` for WebPs), then commit, push, and verify on the live site.

## Remaining

- [ ] When the code is released: activate the **Code** link in `index.html`.
