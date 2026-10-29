# Slabs

Slabs are flat pieces placed in the detail editor to walk on and to block movement and sight. Floors, ramps, walls and roofs are all slabs. A tile lists its slabs: tile files keep them as the manifest's `slabs`, and [plates](plates.md) as `slab` lines holding the same JSON. Code: `client/src/world/slabs.js`. [Schema](../schema/slab.schema.json).

```json
{
  "at": [6150.5, 42, 2040],
  "turn": [30, -90, 0],
  "outline": [[0, 0], [12, 0], [12, 9], [0, 9]],
  "thickness": 1,
  "surface": "stoneBlocks"
}
```

## Shape

- `at` is a point on the slab's top face, `[x, y, z]` in continent feet.
- `outline` is the top face: 3 to 32 corners `[u, v]` in feet from `at`, u along x (east) and v along z (south) before the slab turns. It may be concave, but its edges don't cross.
- `thickness` is how far the slab goes down from its top face, more than 0 and at most 16 ft.
- `turn` is `[yaw, pitch, roll]` in degrees, applied roll, pitch, yaw, as an object piece's turn. Unturned, the top face is level and faces up. Pitch -90° stands a slab up into a wall, its outline's v pointing up and its thickness going south.

## Surface

`surface` is the name of a preset, with its colours baked in:

| Kind | Presets |
| --- | --- |
| Wood | `woodgrain`, `floorboards`, `logs`, `shingles` |
| Stone | `stone`, `stoneBlocks`, `brick`, `roughRock`, `dirtyStone`, `cobblestone`, `flagstones`, `marble`, `sandstone` |
| Roofs | `thatch`, `slateTiles`, `clayTiles` |
| Other | `plaster`, `packedEarth`, `ironPlate`, `rustyIronPlate` |

Or it's `{ color, pattern, tile, palette }`:

- `color` is `#rrggbb`.
- `pattern` shades the colour the way the ground's patterns do: `grass`, `dirt`, `sand`, `rock`, `path`, `shore`, `mud`, `moss` or `litter`.
- `tile` repeats one of the world's textures over the slab instead, `{ image, every, jitter }` as an object piece's tile.
- `palette` lists up to 26 `#rrggbb` colours, for the tiled texture's letter inks in turn. Without one, every letter ink is `color`.

## Which tile

A slab belongs to the tile holding its home corner: the north-most top corner, the west-most of those. Every corner, top and bottom, is within 64 ft of the home corner. So to find the slabs near a point, read the tiles that touch a 64 ft square around it.
