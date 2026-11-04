#!/usr/bin/env python3
# Bakes the stock effect textures into one grayscale sheet: public/effects/stock.png, with the names
# of its cells in client/src/abilities/stockTextures.json. Most come from Kenney's Particle Pack
# (CC0, kenney.nl/assets/particle-pack). Needs Pillow.
#
#   script/bake_effect_textures.py <the pack's folder of PNGs>

import json
import math
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CELL_PX = 128
COLUMNS = 7

# Each texture's name and its file in the pack, or None for one drawn below. A spark lies along x,
# because that's the way a stretched particle stretches.
TEXTURES = [
    ("dot", "circle_05"),
    ("spark", "rotated/trace_06_rotated"),
    ("star", "star_06"),
    ("smoke", "smoke_04"),
    ("ring", "circle_02"),
    ("shard", None),
    ("flame", "muzzle_02"),
    ("noise", "smoke_02"),
    ("sparkle", "star_08"),
    ("glint", "star_04"),
    ("glow", "star_09"),
    ("flare", "flare_01"),
    ("slash", "slash_02"),
    ("slash-thin", "slash_04"),
    ("scratch", "scratch_01"),
    ("streak", "rotated/trace_02_rotated"),
    ("lightning", "spark_01"),
    ("lightning-line", "spark_07"),
    ("flame-lick", "flame_05"),
    ("flame-burst", "muzzle_01"),
    ("fire", "fire_01"),
    ("puff", "smoke_07"),
    ("smoke-ring", "smoke_10"),
    ("wisp", "flame_02"),
    ("halo", "circle_03"),
    ("sigil", "magic_02"),
    ("twirl", "twirl_01"),
    ("scorch", "scorch_01"),
]


def shard():
    """A hard-edged sliver, lit on one side. The pack has nothing that reads as a broken piece."""
    image = Image.new("L", (CELL_PX, CELL_PX))
    for j in range(CELL_PX):
        for i in range(CELL_PX):
            x = (i + 0.5) / CELL_PX * 2 - 1
            y = 1 - (j + 0.5) / CELL_PX * 2
            if abs(x) * 2.2 + abs(y) * 1.1 < 0.95:
                image.putpixel((i, j), round(255 * (0.75 + 0.25 * math.copysign(1, x + y * 0.3))))
    return image


def from_pack(folder, name):
    """The file's brightness where it shows, cropped to fill its cell so a particle's size means what
    it says, as bright as it goes, fading out at its edges so cells don't bleed into each other."""
    rgba = Image.open(folder / f"{name}.png").convert("RGBA")
    gray = Image.new("L", rgba.size)
    gray.putdata([round(sum(p[:3]) / 3 * p[3] / 255) for p in rgba.get_flattened_data()])
    left, top, right, bottom = gray.point(lambda v: 255 if v > 12 else 0).getbbox()
    half = max(right - left, bottom - top) / 2 * 1.06
    x, y = (left + right) / 2, (top + bottom) / 2
    fits = x - half >= 0 and y - half >= 0 and x + half <= gray.width and y + half <= gray.height
    box = (x - half, y - half, x + half, y + half) if fits else None
    cell = gray.resize((CELL_PX, CELL_PX), Image.LANCZOS, box=box)
    most = cell.getextrema()[1] or 1
    image = Image.new("L", (CELL_PX, CELL_PX))
    for j in range(CELL_PX):
        for i in range(CELL_PX):
            u = (i + 0.5) / CELL_PX * 2 - 1
            v = (j + 0.5) / CELL_PX * 2 - 1
            edge = min(1, (1 - max(abs(u), abs(v))) * 16)
            image.putpixel((i, j), round(cell.getpixel((i, j)) * 255 / most * edge))
    return image


def main(folder):
    rows = math.ceil(len(TEXTURES) / COLUMNS)
    sheet = Image.new("L", (COLUMNS * CELL_PX, rows * CELL_PX))
    for n, (_, file) in enumerate(TEXTURES):
        cell = from_pack(folder, file) if file else shard()
        sheet.paste(cell, (n % COLUMNS * CELL_PX, n // COLUMNS * CELL_PX))
    out = ROOT / "public/effects/stock.png"
    out.parent.mkdir(exist_ok=True)
    sheet.save(out, optimize=True)
    names = {"columns": COLUMNS, "rows": rows, "textures": [name for name, _ in TEXTURES]}
    (ROOT / "client/src/abilities/stockTextures.json").write_text(json.dumps(names, indent=2) + "\n")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
