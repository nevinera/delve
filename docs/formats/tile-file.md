# Tile files

The editor holds each tile as one binary file while a world is open. Worlds store tiles in [plates](plates.md), so you only meet tile files inside the editor and its workers. Code: `client/src/world/tileCodec.js`.

```
places/continents/<continent>/tiles/<layer>/<tx>/<tz>.dlt.gz
```

The file is gzipped. Inside, all numbers are little-endian:

| Bytes | Meaning |
| --- | --- |
| 0 to 3 | `DLT1` |
| 4 to 7 | uint32: the manifest's length in bytes |
| 8 on | the manifest, UTF-8 JSON |
| then | zero padding to a multiple of 4 bytes |
| then | the dense layers, one after another |

## Manifest

```json
{
  "version": 2,
  "coords": [12, 40],
  "layer": "surface",
  "cells": 64,
  "cellFt": 8,
  "palettes": { "terrain": ["grass", "dirt"], "biome": ["plains"], "water": ["sea", "fresh"] },
  "layers": [{ "name": "height", "type": "i32", "scale": 4, "offset": 0 }],
  "objects": [],
  "falls": [],
  "roads": [],
  "rivers": [],
  "generator": { "version": 23, "seed": 3935363592 }
}
```

- `layers` gives each dense layer's name, type and byte offset from the end of the padding. `falls`, `roads` and `rivers` appear only when the tile has some.
- Each layer is `cells * cells` values in row order: north to south, each row west to east.

## Layers

| Name | Type | Meaning |
| --- | --- | --- |
| `height` | i32, scale 4 | ground height in feet |
| `water` | i32, scale 4 | water surface in feet, or none |
| `waterKind` | u8, optional | index into `palettes.water`, where there's water |
| `terrain` | u8 | index into `palettes.terrain` |
| `biome` | u8 | index into `palettes.biome` |
| `forest` | u8 | forest density |
| `clutter` | u8, optional | ground clutter density, 100 is normal |

An i32 layer stores `round(value * scale)`. Its lowest value, -2^31, means no value and reads as NaN.

## Objects

Each placed object is `{ id, type, at: [x, z], yaw, scale, colors, footprint, height }`, plus any of `base`, `pushed` and `texts`. `at` is in continent feet and `yaw` in radians. `footprint` and `height` are already scaled; see [plates](plates.md#header) for the shapes.
