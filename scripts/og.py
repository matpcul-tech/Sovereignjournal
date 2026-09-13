#!/usr/bin/env python3
"""Typographic Open Graph cards. 1200x627, title in the LinkedIn-safe center."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
POSTS = ROOT / "src" / "content" / "posts"
OUT = ROOT / "public" / "og"

NAVY = (7, 16, 31, 255)
GOLD = (212, 168, 67, 255)
TEAL = (0, 212, 184, 255)
TEXT = (232, 228, 221, 255)
MUTED = (154, 166, 186, 255)
LINE = (28, 47, 77, 255)

# LinkedIn's documented link-preview size. Keep all type inside a 10% inset
# so mobile crops and the on-site featured card still show the title.
W, H = 1200, 627
INSET = 96
SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SANS_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=font) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines[:3]


def parse_frontmatter(raw: str) -> dict[str, str]:
    match = re.match(r"^---\n(.*?)\n---", raw, re.S)
    if not match:
        return {}
    data: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip().strip('"')
    return data


def fmt_date(value: str) -> str:
    try:
        dt = datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return dt.strftime("%B %-d, %Y")
    except ValueError:
        return value


def card(title: str, kicker: str, footer: str, dest: Path) -> None:
    img = Image.new("RGBA", (W, H), NAVY)
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, 14, H), fill=GOLD)

    brand = ImageFont.truetype(SANS_B, 20)
    kicker_font = ImageFont.truetype(SANS, 20)
    title_size = 56 if len(title) > 52 else 64
    title_font = ImageFont.truetype(SERIF, title_size)
    foot_font = ImageFont.truetype(SANS, 20)

    max_w = W - INSET * 2
    lines = wrap(draw, title, title_font, max_w)
    line_h = title_size + 14
    block_h = len(lines) * line_h
    title_y = (H - block_h) // 2 - 8

    draw.text((INSET, 40), "THE SOVEREIGN JOURNAL", font=brand, fill=GOLD)
    draw.rectangle((INSET, 72, INSET + 72, 76), fill=GOLD)
    draw.text((INSET, 96), kicker.upper(), font=kicker_font, fill=TEAL)

    y = title_y
    for line in lines:
        draw.text((INSET, y), line, font=title_font, fill=TEXT)
        y += line_h

    draw.rectangle((INSET, H - 70, W - INSET, H - 69), fill=LINE)
    draw.text((INSET, H - 50), footer, font=foot_font, fill=MUTED)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(dest, "PNG", optimize=True)


def main() -> None:
    card(
        "Building the next hyperscaler one node at a time.",
        "Daily journal  ·  Ada, Oklahoma",
        "Matt Culwell  ·  Sovereign Shield Technologies",
        OUT / "default.png",
    )
    for path in sorted(POSTS.glob("*.md")):
        meta = parse_frontmatter(path.read_text())
        title = meta.get("title") or path.stem
        theme = meta.get("theme") or ""
        date = fmt_date(meta.get("date") or "")
        footer = "  ·  ".join(part for part in (date, theme, "Ada, Oklahoma") if part)
        card(title, theme or "Journal", footer, OUT / f"{path.stem}.png")
        print(path.stem)


if __name__ == "__main__":
    main()
