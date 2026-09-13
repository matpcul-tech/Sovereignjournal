#!/usr/bin/env python3
"""Ensure every post has a photograph in public/og. Do not paint type cards.

If public/og/{slug}.jpg is missing, copy default.jpg so LinkedIn and the
index still have an image. Editorial photographs are authored by hand.
"""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POSTS = ROOT / "src" / "content" / "posts"
OUT = ROOT / "public" / "og"
DEFAULT = OUT / "default.jpg"


def main() -> None:
    if not DEFAULT.exists():
        raise SystemExit("public/og/default.jpg is required")
    OUT.mkdir(parents=True, exist_ok=True)
    for path in sorted(POSTS.glob("*.md")):
        dest = OUT / f"{path.stem}.jpg"
        if dest.exists():
            print("keep", dest.name)
            continue
        shutil.copyfile(DEFAULT, dest)
        print("default", dest.name)


if __name__ == "__main__":
    main()
