#!/usr/bin/env python3
"""Render corrected GLM vs DeepSeek scoreboard PNG with Pillow (no browser)."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1100, 780
OUT = Path(__file__).resolve().parent / "out" / "glm-vs-deepseek-scoreboard.png"

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_B if bold else FONT, size)


def lerp(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def fill_hgrad(draw, box, c1, c2):
    x0, y0, x1, y1 = box
    for x in range(x0, x1):
        t = (x - x0) / max(1, x1 - x0 - 1)
        draw.line([(x, y0), (x, y1)], fill=lerp(c1, c2, t))


def rounded_rect(draw, box, r, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def draw_whale(img: Image.Image, cx: int, cy: int, scale: float = 1.0):
    d = ImageDraw.Draw(img)
    s = scale

    def p(x, y):
        return (cx + int(x * s), cy + int(y * s))

    body = [p(-38, -8), p(-20, -26), p(10, -30), p(40, -18), p(48, 0), p(40, 18), p(10, 28), p(-20, 22), p(-38, 8)]
    d.polygon(body, fill=(37, 99, 235))
    d.polygon([p(40, -10), p(62, -28), p(58, -4), p(68, 10), p(42, 8)], fill=(29, 78, 216))
    d.polygon([p(-30, -10), p(-55, -28), p(-48, -2), p(-34, 4)], fill=(96, 165, 250))
    d.ellipse([*p(-22, -10), *p(-10, 2)], fill=(15, 23, 42))
    d.ellipse([*p(-18, -8), *p(-14, -4)], fill=(255, 255, 255))
    d.arc([*p(-8, 0), *p(28, 22)], 20, 160, fill=(147, 197, 253), width=3)


def main():
    # soft gradient background
    img = Image.new("RGB", (W, H), (247, 249, 252))
    px = img.load()
    for y in range(H):
        for x in range(W):
            t = (x / W + y / H) / 2
            r = int(238 + (255 - 238) * t)
            g = int(244 + (246 - 244) * (1 - t) + 8 * t)
            b = int(255 - 20 * t)
            # warm corner
            warm = (x / W) * (y / H)
            r = min(255, int(r + 18 * warm))
            g = min(255, int(g + 8 * warm))
            b = max(230, int(b - 30 * warm))
            px[x, y] = (r, g, b)

    draw = ImageDraw.Draw(img, "RGBA")

    # white card
    card = (48, 40, W - 48, H - 70)
    rounded_rect(draw, card, 28, fill=(255, 255, 255))
    # soft shadow approximation
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((52, 48, W - 44, H - 58), radius=28, fill=(20, 40, 80, 28))
    img = Image.alpha_composite(img.convert("RGBA"), shadow).convert("RGB")
    draw = ImageDraw.Draw(img)

    rounded_rect(draw, card, 28, fill=(255, 255, 255))

    title = "GLM-5.3-Flash vs DeepSeek V4 Flash — the scoreboard"
    tf = font(28, bold=True)
    tw = draw.textlength(title, font=tf)
    draw.text(((W - tw) / 2, 68), title, fill=(18, 24, 38), font=tf)

    boards = [
        {
            "title": "GLM-5.3-Flash",
            "x0": 78,
            "grad": ((29, 78, 216), (14, 165, 164)),
            "rows": [
                ("AA Index", "57 (independent)"),
                ("Active params", "18B"),
                ("Context", "1M tokens"),
                ("Modality", "text / image / video"),
                ("Open weights", "MIT, live now"),
                ("Price (in / out)", "$0.15 / $0.50"),
                ("Promo (until 09.09)", "$0.075 / $0.25"),
                ("Cache-Hit input", "$0.03  ·  promo $0.015"),
                ("Time-of-day", "flat 24/7 (PAYG)"),
            ],
        },
        {
            "title": "DeepSeek V4 Flash",
            "x0": 560,
            "grad": ((30, 64, 175), (37, 99, 235)),
            "rows": [
                ("AA Index", "52 (independent)"),
                ("Active params", "~13B"),
                ("Context", "1M tokens"),
                ("Modality", "text (vision in exp build)"),
                ("Open weights", "yes"),
                ("Price miss / out", "$0.22 / $0.66"),
                ("Window", "off-peak only"),
                ("Cache-Hit input", "$0.007"),
                ("Time-of-day", "off-peak = 50% of peak"),
            ],
        },
    ]

    board_top = 120
    board_w = 462
    header_h = 46
    row_h = 42
    n_rows = 9
    board_h = header_h + n_rows * row_h + 8

    for b in boards:
        x0 = b["x0"]
        y0 = board_top
        x1 = x0 + board_w
        y1 = y0 + board_h
        rounded_rect(draw, (x0, y0, x1, y1), 16, fill=(255, 255, 255), outline=(231, 235, 243), width=1)

        # header with clipped gradient via mask
        header = Image.new("RGBA", (board_w, header_h), (0, 0, 0, 0))
        hd = ImageDraw.Draw(header)
        for x in range(board_w):
            t = x / max(1, board_w - 1)
            hd.line([(x, 0), (x, header_h)], fill=lerp(b["grad"][0], b["grad"][1], t) + (255,))
        mask = Image.new("L", (board_w, header_h), 0)
        md = ImageDraw.Draw(mask)
        md.rounded_rectangle((0, 0, board_w, header_h + 20), radius=16, fill=255)
        img.paste(header.convert("RGB"), (x0, y0), mask)

        draw = ImageDraw.Draw(img)
        draw.text((x0 + 18, y0 + 12), b["title"], fill=(255, 255, 255), font=font(16, bold=True))

        lf = font(14)
        vf = font(14, bold=True)
        for i, (label, value) in enumerate(b["rows"]):
            ry = y0 + header_h + i * row_h
            if i > 0:
                draw.line([(x0 + 1, ry), (x1 - 1, ry)], fill=(238, 241, 246))
            draw.text((x0 + 18, ry + 12), label, fill=(107, 114, 128), font=lf)
            vw = draw.textlength(value, font=vf)
            # promo / cache accents
            color = (15, 118, 110) if "promo" in label.lower() or label.startswith("Promo") else (17, 24, 39)
            if "promo $" in value:
                # split main and promo for GLM cache line already combined
                color = (17, 24, 39)
            draw.text((x1 - 18 - vw, ry + 12), value, fill=color, font=vf)

    foot = (
        "Prices USD / 1M tokens. GLM: official list + 50% promo through 09.09.2026 24:00 (UTC+8). "
        "DeepSeek: off-peak only. AA Index independently measured."
    )
    ff = font(12)
    fw = draw.textlength(foot, font=ff)
    draw.text(((W - fw) / 2, H - 95), foot, fill=(154, 163, 178), font=ff)

    draw_whale(img, W - 90, H - 55, scale=1.05)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
