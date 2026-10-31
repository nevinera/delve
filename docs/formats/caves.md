# Caves

A version 2 world keeps the caves dug by hand in /create in a binary file for each plate (2,048 ft square) that has any. Code: `client/src/v2/caves.js`.

```
places/continents/<continent>/caves/<px>_<pz>.caves
```

## What's kept

Under the ground everything is rock, but where a cave opens air. Each 4 ft cell of a tile with caves keeps a column of air spans, lowest first, so ledges, arches and caves over caves are just more spans. A span has:

- `floor` and `ceiling`, heights in feet, to a quarter foot.
- `theme`, how its rock looks: 0 jagged, 1 smooth, 2 carved, 3 mined.
- `hewn`, whether it was cut flat-faced, as by hand.

Where a span reaches up through the ground, the cave opens there: a mouth. Digging up through the ground leaves the span 2 ft over it.

## The file

The file is gzipped. Inside, little-endian:

| Field | Type | What |
| --- | --- | --- |
| magic | 4 bytes | `DLC1` |
| version | u32 | 1 |
| px, pz | i32, i32 | the plate |
| tiles | u8 | how many tiles follow |

Then for each tile:

| Field | Type | What |
| --- | --- | --- |
| index | u8 | the tile's place in the plate, `tz * 8 + tx`, each 0 to 7 |
| counts | 4,096 × u8 | how many spans each cell has, row by row from the northwest |
| spans | 10 bytes each | for each cell in turn, its spans: i32 floor and i32 ceiling in quarter feet, u8 theme, u8 hewn |

Tiles with no air are left out, and a plate with none has no file.
