# Caves

A version 2 world keeps its caves in a text file for each plate (8×8 tiles, 2,048 ft square) that has any. Code: `client/src/v2/caves.js`.

```
places/continents/<continent>/caves/<px>_<pz>.caves
```

## What's kept

Under the ground everything is rock, except where a cave opens air. The caves are made of 2 ft voxels. Each 2 ft column of a tile with caves keeps its air as spans, lowest first, so ledges, arches and caves over caves are just more spans. A span has:

- a start, the height of its floor, a multiple of 2 ft.
- a length, how far up its ceiling is, a multiple of 2 ft under 1,024 ft.
- three stone types: its ceiling's, its walls' and its floor's.
- the cave network it's in.

Every cave is in a named network. A network's name is a slug: lowercase letters and digits in words joined by hyphens, such as `wailing-hollow`. Each 32 ft chunk of the caves belongs to one network. Two networks can cross over each other in plan, with at least 32 ft between their chunks up and down.

A stone type is a theme, 0 jagged, 1 smooth, 2 carved or 3 mined, plus 4 if it's hewn (cut flat-faced, as by hand). Where the rock faces up it takes the floor type of the nearest span, where it faces down the ceiling type, and where it faces sideways the wall type.

Only an entrance in the [cave layout](cave-layout.md) may reach up through the ground.

## Mouths

Where an entrance opens through the ground, the caves draw the ground near it, not the ground's own mesh. Each 4 ft ground cell with an open column in it, or next to one, is drawn by the caves: a 2 ft square for each column that's still closed, on the ground's heights, in the ground's look. Open columns are left out, so the mouth is a hole in the ground with the cave behind it. Nothing about mouths is kept in the file; they come from the spans.

## Numbers

Numbers are base64 digits, as in [plates](v2-plates.md): `A`–`Z` `a`–`z` `0`–`9` `+` `/` stand for 0 to 63, most significant digit first. Heights and lengths are in quarter feet. A height written absolutely is the height plus 32,768.

## Layout

```
caves 2 <px> <pz>
tile <index> <network>
<cells>
tile <index> <network>
...
```

The first line gives the format's version, 2, and the plate. Each tile with air comes in row order, with `index` = `tz * 8 + tx` within the plate. A tile with air from more than one network comes once for each, highest first, by its highest ceiling. Each time, its cells take one line, in one of three forms, with only that network's spans. Writers pick the shortest.

Readers take files of version 1, from before networks, and the gzipped binary files before them, as having no caves. /create clears them when it saves.

A span is written as 3 digits of stone types (ceiling, wall, floor), then its start, then 2 digits of length.

### `c3`: anything

`c3 <counts> <spans>`

- `counts`: 16,384 digits, how many spans each column has, in row order from the northwest.
- `spans`: every span, column by column, lowest first, 11 digits each with no breaks: types, a 6-digit start written absolutely, and its length.

### `c2`: starts within 1,024 ft

`c2 <base> <counts> <spans>`

- `base`: the tile's lowest span start, 3 digits, written absolutely.
- `counts`: the columns in row order. A digit 0 to 31 is how many spans the next column has. A digit 32 to 63 stands for that many less 30 empty columns in a row (2 to 33).
- `spans`: every span, as in `c3`, but 7 digits each: its start is 2 digits over the base.

No column may have more than 31 spans.

### `c1`: few spans

`c1 <count> <span> <span> ...`

- `count`: how many spans, 2 digits.
- Each span, after a space: its column's index in row order within the tile, 3 digits, then 11 digits as in `c3`. A column's spans come lowest first.

### Zipped

`c1z`, `c2z` and `c3z` are followed by a space and a zstd frame in base64 (3 bytes to 4 digits, the last group short). Unzipped, it's what follows `c1`, `c2` or `c3`.
