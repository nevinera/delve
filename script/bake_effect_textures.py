#!/usr/bin/env python3
# Bakes the stock effect textures. The sheet of shapes, public/effects/stock.png, mostly comes from
# Kenney's Particle Pack (CC0, kenney.nl/assets/particle-pack). The repeating ones that scroll across
# effects' shapes, public/effects/<name>.png, are drawn here. Their names and the sheet's cells go in
# client/src/abilities/stockTextures.json. Needs Pillow.
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


REPEAT_PX = 256


def scramble(i, j, seed):
    n = i * 374761393 + j * 668265263 + seed * 2147483647
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 0xFFFF


def lattice_noise(x, y, across, down, seed):
    """Smooth noise from 0 to 1 that repeats every 1 in x and y, with this many bumps each way."""
    u, v = x * across, y * down
    i, j = math.floor(u), math.floor(v)
    fu, fv = u - i, v - j
    fu, fv = fu * fu * (3 - 2 * fu), fv * fv * (3 - 2 * fv)

    def corner(a, b):
        return scramble(a % across, b % down, seed)

    top = corner(i, j) * (1 - fu) + corner(i + 1, j) * fu
    bottom = corner(i, j + 1) * (1 - fu) + corner(i + 1, j + 1) * fu
    return top * (1 - fv) + bottom * fv


def fbm(x, y, across, down, seed, octaves=4):
    total, weight, most = 0, 1, 0
    for octave in range(octaves):
        total += lattice_noise(x, y, across * 2**octave, down * 2**octave, seed + octave) * weight
        most += weight
        weight /= 2
    return total / most


def contrast(v, low, high):
    return max(0, min(1, (v - low) / (high - low)))


def hexes(x, y, tiles=4):
    """Thin bright lines between hexagons. A tile holds two, so it repeats after whole tiles."""
    u, v = x * tiles % 1, y * tiles % 1
    centers = [(a + 0.5 * odd, b + 0.5 * odd) for odd in (0, 1) for a in range(-1, 3) for b in range(-1, 3)]
    near = sorted(math.hypot((u - a) * math.sqrt(3), (v - b) * 3) for a, b in centers)
    return 1 - contrast(near[1] - near[0], 0.05, 0.16)


def motes(x, y, cells=8, seed=8):
    """Scattered soft dots."""
    u, v = x * cells, y * cells
    i, j = math.floor(u), math.floor(v)
    best = 0
    for a in range(i - 1, i + 2):
        for b in range(j - 1, j + 2):
            cell = (a % cells, b % cells)
            if scramble(*cell, seed + 2) < 0.45:
                continue
            at = (a + 0.2 + 0.6 * scramble(*cell, seed), b + 0.2 + 0.6 * scramble(*cell, seed + 1))
            size = 0.12 + 0.2 * scramble(*cell, seed + 3)
            best = max(best, contrast(size - math.hypot(u - at[0], v - at[1]), 0, size))
    return best


# Each repeating texture, as brightness from x and y, 0 to 1 across it. x runs around or along a
# shape's sweep, and y up it or out from its middle.
REPEATING = {
    "plain": lambda x, y: 1,
    "energy": lambda x, y: contrast(fbm(x, y, 4, 4, 1), 0.28, 0.72),
    "streaks": lambda x, y: contrast(fbm(x, y, 12, 1, 12, 3), 0.3, 0.72),
    "bands": lambda x, y: contrast(fbm(x, y, 1, 12, 16, 3), 0.3, 0.72),
    "swirl": lambda x, y: contrast(fbm((x + y) % 1, y, 10, 1, 20, 3), 0.3, 0.72),
    "ripple": lambda x, y: (0.5 + 0.5 * math.sin((y * 6 + fbm(x, y, 3, 3, 24, 2) * 1.2) * math.tau)) ** 2,
    "motes": motes,
    "hex": hexes,
}


def repeating(draw):
    image = Image.new("L", (REPEAT_PX, REPEAT_PX))
    image.putdata([round(255 * draw(i / REPEAT_PX, j / REPEAT_PX)) for j in range(REPEAT_PX) for i in range(REPEAT_PX)])
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
    for name, draw in REPEATING.items():
        repeating(draw).save(out.parent / f"{name}.png", optimize=True)
    names = {"columns": COLUMNS, "rows": rows, "textures": [name for name, _ in TEXTURES], "repeating": list(REPEATING)}
    (ROOT / "client/src/abilities/stockTextures.json").write_text(json.dumps(names, indent=2) + "\n")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
