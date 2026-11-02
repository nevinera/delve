# Caves

A version 2 world keeps its caves in a text file for each plate (8×8 tiles, 2,048 ft square) that has any. Code: `client/src/v2/caves.js`.

```
places/continents/<continent>/caves/<px>_<pz>.caves
```

## What's kept

Under the ground everything is rock, except where a cave opens air. Each 4 ft cell of a tile with caves keeps a column of air spans, lowest first, so ledges, arches and caves over caves are just more spans. A span has:

- a start, the height of its floor.
- a length, how far up its ceiling is, under 1,024 ft.
- three stone types: its ceiling's, its walls' and its floor's.

A stone type is a theme, 0 jagged, 1 smooth, 2 carved or 3 mined, plus 4 if it's hewn (cut flat-faced, as by hand). Where the rock faces up it takes the floor type of the nearest span, where it faces down the ceiling type, and where it faces sideways the wall type.

Only an entrance, a node in the [cave layout](cave-layout.md), may reach up through the ground. Where it does, the file keeps how its tube meets the ground, worked out in /create, so readers draw it without working it out again.

## Numbers

Numbers are base64 digits, as in [plates](v2-plates.md): `A`–`Z` `a`–`z` `0`–`9` `+` `/` stand for 0 to 63, most significant digit first. Heights and lengths are in quarter feet. A height written absolutely is the height plus 32,768.

## Layout

```
caves 1 <px> <pz>
tile <index>
<cells>
tile <index>
...
entrances
<entrance>
...
```

The first line gives the format's version, 1, and the plate. Each tile with air comes in row order, with `index` = `tz * 8 + tx` within the plate. Its cells take one line, in one of three forms. Writers pick the shortest.

A span is written as 3 digits of stone types (ceiling, wall, floor), then its start, then 2 digits of length.

### `c3`: anything

`c3 <counts> <spans>`

- `counts`: 4,096 digits, how many spans each cell has, in row order from the northwest.
- `spans`: every span, cell by cell, lowest first, 11 digits each with no breaks: types, a 6-digit start written absolutely, and its length.

### `c2`: starts within 1,024 ft

`c2 <base> <counts> <spans>`

- `base`: the tile's lowest span start, 3 digits, written absolutely.
- `counts`: the cells in row order. A digit 0 to 31 is how many spans the next cell has. A digit 32 to 63 stands for that many less 30 empty cells in a row (2 to 33).
- `spans`: every span, as in `c3`, but 7 digits each: its start is 2 digits over the base.

No cell may have more than 31 spans.

### `c1`: few spans

`c1 <count> <span> <span> ...`

- `count`: how many spans, 2 digits.
- Each span, after a space: its cell's x and z within the tile, 1 digit each, then 11 digits as in `c3`. A cell's spans come lowest first.

### Zipped

`c1z`, `c2z` and `c3z` are followed by a space and a zstd frame in base64 (3 bytes to 4 digits, the last group short). Unzipped, it's what follows `c1`, `c2` or `c3`.

Readers also take the gzipped binary files written before (`DLC1`), each span's one theme and hewn taken for all three of its stone types.

## Entrances

After the tiles, a plate with entrances whose mouths are in it has an `entrances` line, then one line for each, a JSON object. Numbers are in continent feet, to a hundredth.

- `id`: the entrance's node in the cave layout.
- `cells`: the ground cells left out round its mouth, `[ci, cj]` each, continent cells.
- `plane`: the plane nearest the ground's edge round them: `center`, `normal` (facing out of the mouth), `across` and `along` (lying in it), and `reach`, how far the edge goes each way from the center, `[[low, high] across, [low, high] along]`. Readers cut the cave rock away on the normal's side of it, near the mouth, in the tiles beside the cells.
- `ground`: the ground's edge round the cells left out, `[x, y, z]` points in order, closing on itself.
- `rock`: the rock's edge where the plane cuts it, the same way round, starting across from `ground`'s first point.
- `steps`: how the two edges join, a letter a triangle: `a` takes the next point on `ground`, `b` the next on `rock`. Readers color the triangles as the ground is, and draw them with it.

An entrance on a plate's edge is kept only in its mouth's plate, so readers redraw the ground beside it once that plate loads.
