# Plates (version 2 worlds)

A version 2 world keeps its ground in a text file for each plate (8×8 tiles, 2,048 ft square) that has any. Players load them straight from the world's URLs, so they're kept small and line-oriented: an edit changes only the lines for what it touched. Code: `client/src/v2/plate.js`, with heights in `client/src/v2/heights.js`. Version 1 worlds' plates are in [plates](plates.md).

```
places/continents/<continent>/plates/<px>_<pz>.plate
```

## Numbers

Numbers are written in base64 digits: `A`–`Z` `a`–`z` `0`–`9` `+` `/` stand for 0 to 63, most significant digit first. Two digits hold 0 to 4,095 and three hold 0 to 262,143. Space, `~` and newline never appear inside a number. Heights and water levels are in quarter feet, and written absolutely they're the height plus 32,768.

## Layout

```
plate 8 <px> <pz>
tile <index>
h ...
b ...
s ...
w ...
c ...
tile <index>
...
```

Each tile the plate has comes in row order, with `index` = `tz * 8 + tx` within the plate, and runs from its `tile` line to the next. A tile leaves out the lines it has none of: `w` with no water, `c` with no cuts.

## Heights

A tile has 65×65 corner heights, in row order, the last row and column the same as the next tiles' first. Its first `h` line says how they're kept:

- `h z <data>`: zipped. `data` is a zstd frame in base64 (3 bytes to 4 digits, the last group short). Unzipped, it's the base (the tile's lowest height, 3 digits, written absolutely) and a newline, then 65 lines, one per row, each in the `d` form below. Only tiles spanning under 1,024 ft.
- `h c`, then 65 lines `h <heights line>`: each of the tile's 64 chunks of 8×8 cells, in row order, with its own 8×8 corners in row order, then the tile's far edge, 129 corners: row 64 left to right, then column 64 from row 0 to row 63.

A heights line is a format letter, its base (its lowest height, 3 digits, written absolutely) and then its heights:

| Letter | Heights | For a span of |
|---|---|---|
| `f` | none: every height is the base | 0 |
| `1` | 1 digit each, over the base | under 16 ft |
| `2` | 2 digits each, over the base | under 1,024 ft |
| `d` | deltas, by rows | under 1,024 ft |
| `3` | 3 digits each, written absolutely | anything |

In `d`, a height is either a space and 2 digits over the base, or 1 digit: its change from the height before it in its row, plus 31 (-31 to +31 quarter feet). Each row's first height is always the first kind. Rows are 8 long in a chunk and 129 for the edge.

Writers pick the shortest form a tile or line fits, and zip a tile whenever it fits.

## Biomes

`b <runs>`: the tile's 64×64 cells read in row order as one string, as runs. A run is 2 digits of its length less one, then a digit of the biome, an index into `BIOME_NAMES` (`client/src/v2/biomes.js`).

## Object slots

- `s s1 <sx> <sz>`: the slots `makeSlots(sx, sz)` makes (`client/src/v2/slots.js`, generator `s1`), the seed in plain decimal. A new tile is seeded with its own tile coordinates, and keeps its seed from then on.
- `s raw <data>`: slots no generator made, 4 bytes each, in base64.

Readers support every generator there has been, so a world's slots never change when a generator does.

## Water

A line for each chunk of 8×8 cells that isn't dry, its index (0 to 63) in 2 digits, by how it's kept:

- `w <chunk> 1 <type><level>`: one type and level for every cell.
- `w <chunk> 2 <type><levels>`: one type, and 64 levels.
- `w <chunk> 3 <levels><types>`: 64 levels, then 64 types.
- `w all 1 <type><level>`: instead of the rest, for a tile all at one level, such as the sea's.

A type is 1 digit, an index into `WATER_TYPES` (`client/src/v2/water.js`). A level is 3 digits written absolutely, or `~~~` for a dry cell.

## Cuts

How far courses cut the corners down, for putting them back when a course moves (`client/src/v2/courses.js`). A line for each run of cut corners in a row: `c <row> <column> <cuts>`, row and column in 2 digits, then 2 digits a corner: its cut in quarter feet, plus 2,048 (under 2,048 where a course built the ground up).

## Older plates

Readers still take the gzipped binary plates written before (`client/src/v2/plateBinary.js`, versions 2 to 7), told apart by their first two bytes. What those painted on the ground by hand is left out.
