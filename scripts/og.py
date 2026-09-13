#!/usr/bin/env python3
"""Typographic Open Graph cards for The Sovereign Journal. Navy, gold, no stock photos."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
POSTS = ROOT / "src" / "content" / "posts"
OUT = ROOT / "public" / "og"

NAVY = (7, 16, 31, 255)
NAVY2 = (12, 26, 48, 255)
LINE = (28, 47, 77, 255)
GOLD = (212, 168, 67, 255)
TEAL = (0, 212, 184, 255)
TEXT = (232, 228, 221, 255)
MUTED = (154, 166, 186, 255)

W, H = 1200, 630
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
    return lines[:4]


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


def card(title: str, kicker: str, footer: str, dest: Path) -> None:
    img = Image.new("RGBA", (W, H), NAVY)
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, 18, H), fill=GOLD)
    draw.rectangle((18, 0, W, 18), fill=NAVY2)
    draw.ellipse((W - 92, 48, W - 72, 68), fill=TEAL)

    brand = ImageFont.truetype(SANS_B, 22)
    kicker_font = ImageFont.truetype(SANS, 22)
    title_font = ImageFont.truetype(SERIF, 58)
    foot_font = ImageFont.truetype(SANS, 22)

    draw.text((72, 56), "THE SOVEREIGN JOURNAL", font=brand, fill=GOLD)
    draw.rectangle((72, 100, 152, 104), fill=GOLD)
    draw.text((72, 128), kicker.upper(), font=kicker_font, fill=TEAL)

    lines = wrap(draw, title, title_font, W - 150)
    y = 200
    for line in lines:
        draw.text((72, y), line, font=title_font, fill=TEXT)
        y += 72

    draw.rectangle((72, H - 92, W - 72, H - 91), fill=LINE)
    draw.text((72, H - 68), footer, font=foot_font, fill=MUTED)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(dest, "PNG", optimize=True)


def fmt_date(value: str) -> str:
    try:
        dt = datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return dt.strftime("%B %-d, %Y")
    except ValueError:
        return value


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
