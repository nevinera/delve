# Plates

A plate holds 16×16 tiles of one layer of a continent as plain ASCII text. A world stores all its tiles in plates. Code: `client/src/world/plateCodec.js` (the text), `client/src/editor/plates.js` (packing a world's tiles into plates and back).

## Where plates live

```
places/continents/<continent>/plates.json
places/continents/<continent>/plates/<layer>/<px>_<pz>.plate
```

Tile `(tx, tz)` is in plate `(floor(tx / 16), floor(tz / 16))`. The only layer so far is `surface`. Each continent's `plates.json` lists its plates and their hashes ([schema](../schema/plates-index.schema.json)):

```json
{
  "version": 1,
  "plates": {
    "surface/0_1": "0de2ab05af484c36",
    "surface/1_0": "51e9207836d50daf"
  }
}
```

A plate's hash is 16 hex digits, a 64-bit hash of its text (`plateHash` in `plates.js`). A client compares hashes to fetch only the plates that changed.

## Layout

A plate is a header, then its tiles in row order (by `tz`, then `tx`). Each tile runs from its `tile` line to the next `tile` line, so you can read a plate one tile at a time. Lines end in `\n`. Words on a line are separated by one space.

```
plate 2 0,1 surface
palette terrain grass dirt sand rock path shore mud moss tree_pine_2
palette biome plains forest rocky swamp
palette water sea fresh
clutter 100
object 0 circle:0.45 0.8 boulder
object 1 capsule:0.07,0.5 0.14 driftLog
object 2 open:24 =18 structure:k2m9x0aa
tile 0,16 64
generator 23 3935363592
layer height
G3kG3mG3p…            (64 rows of 64 values)
layer water =0G0
layer waterKind =0
layer terrain =2
layer biome
…
layer forest =00
chunks clutter
3,5 =0o
place 0 0A30r1V010
place 1 1x0Ku3Ab10 6b4a2c
tile 1,16 64
…
```

## Values

Values are fixed width, written in this 64-symbol alphabet, most significant symbol first:

```
0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_
```

So `0` is 0, `_` is 63, and `10` is 64.

| Value | Width | Meaning |
| --- | --- | --- |
| height, water | 3 | quarter feet above -256 ft: `(feet + 256) * 4`. `~~~` means no value (no water). |
| palette index | 1, or 2 when the palette has more than 64 entries | index into the plate's palette |
| forest | 2 | 0 to 255 |
| clutter | 2 | ground clutter density, 100 is normal |
| object id | 1, or 2 when the plate has more than 64 kinds | index into the object table |

## Header

| Line | Meaning |
| --- | --- |
| `plate <version> <px>,<pz> <layer>` | Always first. The current version is 2. |
| `palette <name> <entry> …` | One line each for `terrain`, `biome` and `water`. Tiles' palette layers index these. |
| `clutter <n>` | The plate's default clutter. A tile uses it unless it has its own `clutter` line. |
| `object <id> <footprint> <height> <kind>` | The object table: one line per kind of object placed in the plate, sorted by kind name. |

An object line gives the kind's size at scale 1. Placed objects scale it by their own scale.

- `<footprint>` is what the object blocks on the ground, in feet at scale 1:
  - `circle:<r>` is a circle of radius r.
  - `rect:<w>,<d>` is a rectangle, w along the object's own x.
  - `capsule:<r>,<half>` is a capsule of radius r, reaching `half` each way along the object's own x.
  - `open:<reach>` blocks nothing, and doesn't scale. Structures use it, since you walk into them. `reach` is how far the structure reaches from its anchor.
  - `-` means the size isn't known.
- `<height>` is the height in feet. A leading `=` means it doesn't scale with the object (structures). `-` means it isn't known.
- `<kind>` is the rest of the line: a built-in kind such as `boulder`, `built:<id>` for one of the world's objects, or `structure:<id>` for one of its structures.

Version 1 plates have `object <id> <kind>`, with no sizes. Readers accept both.

## Tiles

| Line | Meaning |
| --- | --- |
| `tile <tx>,<tz> <cells>` | Starts a tile. `cells` is cells a side (64, at 8 ft a cell). |
| `generator <version> <seed>` | What generated the tile. |
| `clutter <n>` | The tile's default clutter, when it isn't the plate's. |
| `layer <name>` then `cells` rows | One row per line, north to south, each row's values west to east. |
| `layer <name> =<value>` | Every cell has this value. |
| `chunks clutter` then chunk lines | Clutter for each 8×8-cell chunk that has a cell off the tile's default. |
| `place …` | A placed object, one per line, sorted by their position field. |
| `fall <json>`, `road <json>`, `river <json>` | Waterfalls, roads and river channels, as the tile file holds them. |

Layers come in the order the tile file lists them (`SURFACE_LAYERS` in `tileCodec.js`), minus clutter: `height`, `water`, `waterKind`, `terrain`, `biome`, `forest`.

A chunk line is `<cx>,<cz> =<value>` when all 64 cells share a value, or `<cx>,<cz>` followed by 64 values in row order with no spaces.

### Place lines

```
place <id> <x><z><yaw><scale> [<colors>] [<json>]
```

The third word packs four fixed-width values with no spaces:

| Field | Width | Meaning |
| --- | --- | --- |
| x, z | 3 each | feet from the plate's corner `(px * 8192, pz * 8192)`, in 1/32 ft |
| yaw | 2 | turns, in 1/4096 of a turn |
| scale | 2 | in 1/64ths |

The first word after `place` is the object id. `<colors>` is the object's color overrides, each 6 hex digits, run together. `<json>` holds every other field the object has, such as `base`, `pushed` or `texts`. It also holds `at` or `scale` when they don't fit the packed fields.

Plates don't store an object's `id`. Readers number each tile's objects `<tx>.<tz>.<n>` in line order. A reader works out `footprint` and `height` from the object table.

## Writing plates

Write them in the same way each time, so an unchanged tile gives an unchanged plate and git diffs stay small:

- Sort the object table by kind name.
- Sort place lines by their position field.
- Write a layer as `=<value>` whenever every cell matches.

`node script/plates.mjs <world directory>` packs a world on disk into plates again, sized by that world's own library.
