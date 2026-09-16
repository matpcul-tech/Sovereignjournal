#!/usr/bin/env python3
"""Give each post its own 1200x627 photograph.

If public/og/{slug}.jpg is missing, or is still a copy of default.jpg,
fetch a cinematic still from Pollinations using the scene the writer
emitted (out/latest.json) or the theme's photo line. Crop to OG size.
"""

from __future__ import annotations

import hashlib
import json
import re
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
POSTS = ROOT / "src" / "content" / "posts"
OUT = ROOT / "public" / "og"
DEFAULT = OUT / "default.jpg"
LATEST = ROOT / "out" / "latest.json"
THEMES = ROOT / "themes.json"
W, H = 1200, 627
STYLE = (
    "photoreal cinematic still photograph, 35mm film, no people, no faces, "
    "no text, no logos, no watermarks, editorial, Oklahoma rural light, quiet"
)

FALLBACK = {
    "inclusive-adaptive-capacity": "empty rural clinic waiting room, four teal chairs, reception window, afternoon light through blinds",
    "sovereignty-tension": "heavy padlock and brass keys on a steel container door, prairie dusk, first stars",
    "participatory-sensemaking": "empty wood-paneled council room, oval table, papers, a tribal flag in the corner",
    "one-node-at-a-time": "single dark modular compute container on a gravel pad in an Oklahoma field at sunset",
    "cost-of-consistency": "locked gray records cabinet and a rubber stamp on a metal desk in a clinic back room",
    "psychological-safety-as-mediator": "empty hospital conference room, one chair pulled back, light under a closed door",
    "the-data-moat": "closed lockbox on a pallet in front of a humming server rack inside a container",
    "equity-centered-flexibility": "empty rural hospital hallway, a gurney against the wall, uneven fluorescent light",
    "building-from-a-phone": "a phone and a notebook on a kitchen table at night, dark prairie outside the window",
    "governance-before-compute": "a worn binder of papers on a wooden pallet in front of dark server racks",
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def slug_of(post: Path) -> str:
    return post.stem


def theme_slug(stem: str) -> str:
    return re.sub(r"^\d{4}-\d{2}-\d{2}-", "", stem)


def load_scene(stem: str) -> str:
    if LATEST.exists():
        try:
            data = json.loads(LATEST.read_text())
            if data.get("slug") == stem and data.get("photo"):
                return str(data["photo"]).strip()
        except json.JSONDecodeError:
            pass
    if THEMES.exists():
        try:
            themes = json.loads(THEMES.read_text()).get("themes", [])
            want = theme_slug(stem)
            for t in themes:
                if t.get("slug") == want and t.get("photo"):
                    return str(t["photo"]).strip()
        except json.JSONDecodeError:
            pass
    return FALLBACK.get(theme_slug(stem), "shipping container on red Oklahoma dirt under a wide sky")


def fit(im: Image.Image) -> Image.Image:
    im = im.convert("RGB")
    scale = max(W / im.width, H / im.height)
    nw, nh = int(im.width * scale + 0.5), int(im.height * scale + 0.5)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left, top = (nw - W) // 2, (nh - H) // 2
    return im.crop((left, top, left + W, top + H))


def fetch(scene: str, seed: int) -> Image.Image | None:
    prompt = f"{STYLE}. {scene}"
    url = (
        "https://image.pollinations.ai/prompt/"
        + urllib.parse.quote(prompt, safe="")
        + f"?width={W}&height={H}&nologo=true&model=flux&seed={seed}&enhance=true"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "SovereignJournal/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            data = res.read()
        if len(data) < 8000:
            return None
        return Image.open(BytesIO(data))
    except Exception as err:
        print("fetch failed:", err)
        return None


def main() -> None:
    if not DEFAULT.exists():
        raise SystemExit("public/og/default.jpg is required")
    OUT.mkdir(parents=True, exist_ok=True)
    default_hash = digest(DEFAULT)
    for path in sorted(POSTS.glob("*.md")):
        dest = OUT / f"{path.stem}.jpg"
        if dest.exists() and digest(dest) != default_hash:
            print("keep", dest.name)
            continue
        scene = load_scene(path.stem)
        seed = int(hashlib.sha256(path.stem.encode()).hexdigest()[:8], 16)
        print("make", dest.name, "—", scene)
        im = fetch(scene, seed)
        if im is None:
            dest.write_bytes(DEFAULT.read_bytes())
            print("default", dest.name)
            continue
        fit(im).save(dest, "JPEG", quality=86, optimize=True)
        print("wrote", dest.name, dest.stat().st_size)


if __name__ == "__main__":
    main()
