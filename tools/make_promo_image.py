#!/usr/bin/env python3
"""
make_promo_image.py — compose LinkedIn / social promo images from a sim frame.

Grab a still with tools/make_poster.sh (or any PNG/JPG frame of a clip), then lay
the Flow-ERD title over it in the page's palette (charcoal + gold + cyan).

Three layouts:
  banner-cover    1584x396  text left,  image right   (profile top banner / post)
  banner-profile  1584x396  image left, text right    (profile background:
                            the avatar sits bottom-left over the image, so the
                            text on the right is never covered)
  share           16:9      full-bleed image, gradient, text left (post / OG image)

Usage:
  tools/make_promo_image.py --frame FRAME.png --kind share --size 1600x900 --out card.png
  tools/make_promo_image.py --frame FRAME.png --kind banner-cover   --out cover.png
  tools/make_promo_image.py --frame FRAME.png --kind banner-profile --out profile.png

Text is fixed to the approved copy; edit TITLE / EYEBROW / SUBTITLE below to change it.
"""
import argparse, os
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageOps

FONT = "/System/Library/Fonts/Avenir Next.ttc"        # macOS; swap for your platform
HEAVY, BOLD, DEMI = 8, 0, 2                            # face indices within the .ttc

BG = (12, 15, 18); GOLD = (240, 180, 41)
WHITE = (244, 246, 248); MUTED = (150, 164, 173); SUB = (214, 220, 225)

EYEBROW = "FLOW-ERD"
TITLE = ["Generative World Models for", "Autonomous Driving & Robotics"]
SUBTITLE = ["Simulation", "Planning"]                  # joined with gold dots


def f(sz, idx):
    return ImageFont.truetype(FONT, sz, index=idx)


def spaced(d, xy, text, font, fill, ls):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + ls
    return x


def cover_crop(src, W, H, zoom, hfrac, top_frac):
    sw, sh = src.size
    scale = max(W / sw, H / sh) * zoom
    nw, nh = int(sw * scale), int(sh * scale)
    img = src.resize((nw, nh), Image.LANCZOS)
    left = int((nw - W) * hfrac)
    top = int((nh - H) * top_frac)
    return img.crop((left, top, left + W, top + H))


def hgrad(W, H, dark_side, solid=0.46, clear=0.82):
    """Vertical band gradient: bg opaque on `dark_side`, image clear on the other."""
    g = Image.new("L", (W, 1), 0)
    for x in range(W):
        t = x / W if dark_side == "left" else 1 - x / W
        a = 255 if t < solid else (0 if t > clear else int(255 * (1 - (t - solid) / (clear - solid))))
        g.putpixel((x, 0), max(0, a))
    return g.resize((W, H))


def vignette(W, H, px):
    v = Image.new("L", (1, H), 0)
    for y in range(H):
        e = min(y, H - 1 - y)
        v.putpixel((0, y), 0 if e > px else int(120 * (1 - e / px)))
    return v.resize((W, H))


def draw_text_block(canvas, MX, avail, top_anchor, k):
    """Shared text block. Returns nothing; draws eyebrow → title → rule → subtitle."""
    d = ImageDraw.Draw(canvas)

    def fit(text, idx, start, mn):
        s = start
        while s > mn and d.textlength(text, font=f(s, idx)) > avail:
            s -= 1
        return s

    s = min(fit(TITLE[0], HEAVY, int(62 * k), int(38 * k)),
            fit(TITLE[1], HEAVY, int(62 * k), int(38 * k)))
    tf = f(s, HEAVY); lh = int(s * 1.15)
    eyH, subH, ruleH = int(29 * k), int(36 * k), max(4, int(6 * k))

    block_h = eyH + int(30 * k) + 2 * lh + int(24 * k) + ruleH + int(24 * k) + subH
    y0 = top_anchor if top_anchor is not None else (canvas.height - block_h) // 2

    sq = int(20 * k)
    d.rectangle([MX, y0 + int(4 * k), MX + int(0.9 * sq), y0 + int(4 * k) + sq], fill=GOLD)
    spaced(d, (MX + int(34 * k), y0), EYEBROW, f(int(29 * k), BOLD), GOLD, int(5 * k))

    ty = y0 + eyH + int(30 * k)
    d.text((MX, ty), TITLE[0], font=tf, fill=WHITE)
    d.text((MX, ty + lh), TITLE[1], font=tf, fill=WHITE)

    ry = ty + 2 * lh + int(24 * k)
    d.rectangle([MX, ry, MX + int(68 * k), ry + ruleH], fill=GOLD)

    sy = ry + int(24 * k); sf = f(int(36 * k), DEMI); x = MX
    for i, p in enumerate(SUBTITLE):
        d.text((x, sy), p, font=sf, fill=SUB); x += d.textlength(p, font=sf)
        if i < len(SUBTITLE) - 1:
            d.text((x, sy), "   ·   ", font=sf, fill=GOLD); x += d.textlength("   ·   ", font=sf)


def build_banner(src, out, text_side):
    W, H = 1584, 396
    canvas = Image.new("RGB", (W, H), BG)
    img = src if text_side == "left" else ImageOps.mirror(src)
    img = cover_crop(img, W, H, zoom=1.0, hfrac=0.5, top_frac=0.42)
    img = ImageEnhance.Brightness(img).enhance(0.90)
    img = ImageEnhance.Color(img).enhance(1.10)
    canvas.paste(img, (0, 0))
    canvas = Image.composite(Image.new("RGB", (W, H), BG), canvas,
                             hgrad(W, H, "left" if text_side == "left" else "right",
                                   solid=0.47, clear=0.80))
    canvas = Image.composite(Image.new("RGB", (W, H), BG), canvas, vignette(W, H, 60))

    d = ImageDraw.Draw(canvas)
    MX = 74 if text_side == "left" else 690
    avail = (1010 - MX) if text_side == "left" else (W - 74 - MX)
    # banner uses its own compact layout (single scale k≈1 but tuned sizes)
    def fit(text, idx, start, mn=32):
        s = start
        while s > mn and d.textlength(text, font=f(s, idx)) > avail:
            s -= 1
        return s
    s = min(fit(TITLE[0], HEAVY, 56), fit(TITLE[1], HEAVY, 56))
    tf = f(s, HEAVY); lh = int(s * 1.16); ty = 132
    ey = 82
    d.rectangle([MX, ey + 2, MX + 18, ey + 20], fill=GOLD)
    spaced(d, (MX + 34, ey - 1), EYEBROW, f(23, BOLD), GOLD, 5)
    d.text((MX, ty), TITLE[0], font=tf, fill=WHITE)
    d.text((MX, ty + lh), TITLE[1], font=tf, fill=WHITE)
    ry = ty + 2 * lh + 24
    d.rectangle([MX, ry, MX + 64, ry + 4], fill=GOLD)
    sy = ry + 22; sf = f(28, DEMI); x = MX
    for i, p in enumerate(SUBTITLE):
        d.text((x, sy), p, font=sf, fill=SUB); x += d.textlength(p, font=sf)
        if i < len(SUBTITLE) - 1:
            d.text((x, sy), "   ·   ", font=sf, fill=GOLD); x += d.textlength("   ·   ", font=sf)
    canvas.save(out)


def build_share(src, out, W, H):
    k = W / 1600.0
    canvas = Image.new("RGB", (W, H), BG)
    img = cover_crop(src, W, H, zoom=1.34, hfrac=0.60, top_frac=0.34)
    img = ImageEnhance.Brightness(img).enhance(0.92)
    img = ImageEnhance.Color(img).enhance(1.09)
    canvas.paste(img, (0, 0))
    canvas = Image.composite(Image.new("RGB", (W, H), BG), canvas,
                             hgrad(W, H, "left", solid=0.46, clear=0.82))
    canvas = Image.composite(Image.new("RGB", (W, H), BG), canvas, vignette(W, H, int(80 * k)))
    draw_text_block(canvas, MX=int(96 * k), avail=int(980 * k) - int(96 * k),
                    top_anchor=None, k=k)
    canvas.save(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frame", required=True, help="source still (PNG/JPG)")
    ap.add_argument("--kind", required=True,
                    choices=["banner-cover", "banner-profile", "share"])
    ap.add_argument("--size", default="1600x900", help="WxH for --kind share")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    src = Image.open(a.frame).convert("RGB")
    if a.kind == "banner-cover":
        build_banner(src, a.out, "left")
    elif a.kind == "banner-profile":
        build_banner(src, a.out, "right")
    else:
        W, H = (int(v) for v in a.size.lower().split("x"))
        build_share(src, a.out, W, H)
    print(f"→ {a.out}  ({a.kind})")


if __name__ == "__main__":
    main()
