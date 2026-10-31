# Slabs

Slabs are flat pieces placed with `/create`'s build tools to walk on and to block movement and sight. Floors, ramps, walls and roofs are all slabs. A tile lists its slabs: tile files keep them as the manifest's `slabs`, and [plates](plates.md) as `slab` lines holding the same JSON. Code: `client/src/world/slabs.js`. [Schema](../schema/slab.schema.json).

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
- `holes`, when there are any, are up to 16 polygons in the outline's `[u, v]`, each 3 to 32 corners, going right through the slab, for doors and windows. Each is inside the outline, and touches neither it nor another hole.
- `thickness` is how far the slab goes down from its top face, more than 0 and at most 16 ft.
- `turn` is `[yaw, pitch, roll]` in degrees, applied roll, pitch, yaw, as an object piece's turn. Unturned, the top face is level and faces up. Pitch -90° stands a slab up into a wall, its outline's v pointing up and its thickness going south.

## Stairs

A slab with `"kind": "stairs"` is a flight of stairs. It's walked on as the slope it is, and drawn as its steps.

```json
{
  "kind": "stairs",
  "at": [6150.5, 42, 2040],
  "turn": [30, -36.87, 0],
  "outline": [[0, 0], [6, 0], [6, 15], [0, 15]],
  "thickness": 1,
  "surface": "stoneBlocks",
  "risers": null,
  "steps": 15
}
```

- `outline` is a rectangle, `[[0, 0], [width, 0], [width, length], [0, length]]`, with no holes.
- `turn` is `[yaw, pitch, 0]`, pitch from -50° up to 0, so the flight climbs along v and its bottom and top edges are level. `at` is the bottom edge's first corner.
- `steps` is how many steps it has, 1 to 128. The slope runs through the middle of each riser, so the first tread is level with the bottom edge and the last with the top.
- `risers` is the risers' surface, `null` for open risers, or left out for the treads' surface.
- The 64 ft reach limits how long a flight is.

## Surface

`surface` is the name of a preset, painted in its own colour:

| Kind | Presets |
| --- | --- |
| Wood | `woodgrain`, `floorboards`, `logs`, `shingles` |
| Stone | `stone`, `stoneBlocks`, `brick`, `roughRock`, `dirtyStone`, `cobblestone`, `flagstones`, `marble`, `sandstone` |
| Roofs | `thatch`, `slateTiles`, `clayTiles` |
| Other | `plaster`, `packedEarth`, `ironPlate`, `rustyIronPlate` |

Or it's `{ color, preset, pattern, tile, palette }`, with at most one of `preset`, `pattern` and `tile`:

- `color` is `#rrggbb`.
- `preset` paints a preset in `color` instead of its own.
- `pattern` shades the colour the way the ground's patterns do: `grass`, `dirt`, `sand`, `rock`, `path`, `shore`, `mud`, `moss` or `litter`.
- `tile` repeats one of the world's textures over the slab instead, `{ image, every, jitter }` as an object piece's tile.
- `palette` lists up to 26 `#rrggbb` colours, for the tiled texture's letter inks in turn. Without one, every letter ink is `color`.

## Which tile

A slab belongs to the tile holding its home corner: the north-most top corner, the west-most of those. Every corner, top and bottom, is within 64 ft of the home corner. So to find the slabs near a point, read the tiles that touch a 64 ft square around it.
