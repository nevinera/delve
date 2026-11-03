# World file formats

Every file in a version 2 world, plus the game protocol. JSON Schemas are in [docs/schema](../docs/schema). When a format and its code disagree, the code wins: fix this file in the same commit.

A change to a format has to reach every reader of it. The client's is in the code column below. The game server (`game-server/internal/worlds/`) and bots (`lib/bot/`) also read `world.json`, plates, placed and caves files, and `water.json` on the server. Regenerate their shared test world with `node game-server/internal/worlds/testdata/world.mjs`. `.agents/skills/measure-world/measure.mjs` decodes plates, platters and caves.

- [A world's files](#a-worlds-files)
- [Plates](#plates) and [platters](#platters)
- [Placed objects and slabs](#placed-objects-and-slabs), [slabs](#slabs), [templates](#templates)
- [Caves](#caves) and [cave layout](#cave-layout)
- [Biomes, planning marks and water](#biomes-planning-marks-and-water)
- [Bodies](#bodies)
- [Game data](#game-data)
- [The game protocol](#the-game-protocol)

## A world's files

A world is a directory of files, usually a GitHub repo. Paths are relative to its root. `<c>` is a continent key from `world.json`, and ids are 8 lowercase base-36 characters.

| Path | What it is | Format | Code |
| --- | --- | --- | --- |
| `world.json` | version (2), name, level cap, continents, dungeons, spawn point, training dummies | [schema](../docs/schema/world.schema.json) | `client/src/create/main.js` |
| `collections.json` | the world's object collections | [schema](../docs/schema/collections.schema.json) | `client/src/objects/collections.js` |
| `template-collections.json` | the world's template collections | [schema](../docs/schema/collections.schema.json) | `client/src/objects/collections.js` |
| `objects/<id>.json` | a built object | [schema](../docs/schema/object.schema.json) | `client/src/world/builtObjects.js` |
| `templates/<id>.json` | slabs and objects placed together | [Templates](#templates), [schema](../docs/schema/template.schema.json) | `client/src/world/templates.js` |
| `textures/<id>.json` | an image objects and slabs wear | [schema](../docs/schema/image.schema.json) | `client/src/objects/collections.js` |
| `models.json` | the world's own bodies, and what it adds to shipped ones | [A world's models](#a-worlds-models) | `client/src/world/models.js` |
| `classes/`, `abilities/`, `statuses/`, `items/`, `item-templates/`, `creatures/`, `npcs/`, `dialogues/` | game data, each `<id>.json` | [Game data](#game-data) | none yet |
| `places/continents/<c>/plates/<px>_<pz>.plate` | 8×8 tiles' ground, biomes, slots, water and cuts | [Plates](#plates) | `client/src/v2/plate.js` |
| `places/continents/<c>/platters/<px>_<pz>.platter` | renditions of 64×64 tiles and 8×8 plates | [Platters](#platters) | `client/src/v2/platter.js` |
| `places/continents/<c>/placed/<px>_<pz>.json` | objects and slabs placed by hand | [Placed](#placed-objects-and-slabs) | `client/src/create/placed.js` |
| `places/continents/<c>/caves/<px>_<pz>.caves` | caves' air, column by column, by network | [Caves](#caves) | `client/src/v2/caves.js` |
| `places/continents/<c>/caves/layout.json` | the cave networks laid out | [Cave layout](#cave-layout), [schema](../docs/schema/cave-layout.schema.json) | `client/src/create/caveLayout.js` |
| `places/continents/<c>/biomes.json` | biome areas | [below](#biomes-planning-marks-and-water) | `client/src/create/biomes.js`, `client/src/play/loader.js` |
| `places/continents/<c>/planning.json` | planning lines and pins | [below](#biomes-planning-marks-and-water) | `client/src/create/marks.js` |
| `places/continents/<c>/water.json` | the water's bodies and courses | [below](#biomes-planning-marks-and-water) | `client/src/v2/water.js`, `courses.js` |
| `places/continents/<c>/spawns.json` | spawn regions, and mobs and NPCs placed one at a time | [Spawns](#spawns), [schema](../docs/schema/spawns.schema.json) | none yet |

The JSON files that describe things (the world, objects, templates and game data) can have `notes`: free-form text on what a thing is for and its backstory. The game never reads them.

### Coordinates and sizes

Coordinates are feet in continent space: x east, z south, y up. Each size is 8×8 of the one below (`client/src/v2/sizes.js`):

| Size | Feet a side | Covers |
| --- | --- | --- |
| cell | 4 | |
| chunk | 32 | 8×8 cells |
| tile | 256 | 8×8 chunks |
| plate | 2,048 | 8×8 tiles |
| platter | 16,384 | 8×8 plates |

Tile `(tx, tz)` covers `[tx * 256, (tx + 1) * 256)` each way. Caves use 2 ft voxels. Templates use an 8 ft grid (`client/src/world/constants.js`).

### Kept as they are

/create keeps files it doesn't understand, and saves them back unchanged. Older worlds can hold `sketch.json`, `zones/`, `land/`, `index.json`, `thumbs/`, `edited.json` and `plates.json`. Nothing in /create or the game reads them. `docs/schema/plates-index.schema.json` and `shapes.schema.json` cover the version 1 files `script/plates.mjs` writes.

## Plates

A world keeps its ground in a text file for each plate (8×8 tiles, 2,048 ft square) that has any. Players load them straight from the world's URLs, so they're kept small and line-oriented: an edit changes only the lines for what it touched. Code: `client/src/v2/plate.js`, with heights in `client/src/v2/heights.js`.

```
places/continents/<continent>/plates/<px>_<pz>.plate
```

### Numbers

Numbers are written in base64 digits: `A`–`Z` `a`–`z` `0`–`9` `+` `/` stand for 0 to 63, most significant digit first. Two digits hold 0 to 4,095 and three hold 0 to 262,143. Space, `~` and newline never appear inside a number. Heights and water levels are in quarter feet, and written absolutely they're the height plus 32,768.

### Layout

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

### Heights

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

### Biomes

`b <runs>`: the tile's 64×64 cells read in row order as one string, as runs. A run is 2 digits of its length less one, then a digit of the biome, an index into `BIOME_NAMES` (`client/src/v2/biomes.js`).

### Object slots

- `s s1 <sx> <sz>`: the slots `makeSlots(sx, sz)` makes (`client/src/v2/slots.js`, generator `s1`), the seed in plain decimal. A new tile is seeded with its own tile coordinates, and keeps its seed from then on.
- `s raw <data>`: slots no generator made, 4 bytes each, in base64.

Readers support every generator there has been, so a world's slots never change when a generator does.

### Water

A line for each chunk of 8×8 cells that isn't dry, its index (0 to 63) in 2 digits, by how it's kept:

- `w <chunk> 1 <type><level>`: one type and level for every cell.
- `w <chunk> 2 <type><levels>`: one type, and 64 levels.
- `w <chunk> 3 <levels><types>`: 64 levels, then 64 types.
- `w all 1 <type><level>`: instead of the rest, for a tile all at one level, such as the sea's.

A type is 1 digit, an index into `WATER_TYPES` (`client/src/v2/water.js`). A level is 3 digits written absolutely, or `~~~` for a dry cell.

### Cuts

How far courses cut the corners down, for putting them back when a course moves (`client/src/v2/courses.js`). A line for each run of cut corners in a row: `c <row> <column> <cuts>`, row and column in 2 digits, then 2 digits a corner: its cut in quarter feet, plus 2,048 (under 2,048 where a course built the ground up).

### Older plates

Readers still take the gzipped binary plates written before (`client/src/v2/plateBinary.js`, versions 2 to 7), told apart by their first two bytes. What those painted on the ground by hand is left out.

## Platters

A world keeps the renditions of its tiles and plates in a text file for each platter (64×64 tiles, 8×8 plates, 16,384 ft square), so a client can draw a continent's ground from afar in a few requests. Code: `client/src/v2/platter.js`.

```
places/continents/<continent>/platters/<px>_<pz>.platter
```

A rendition is a tile's or plate's ground an eighth of its size across: heights at the 9×9 corners of its 8×8 parts (a tile's chunks, or a plate's tiles), with a hash of what it was made from, to tell when it's out of date (`client/src/v2/rendition.js`).

### Layout

Numbers are written as in [plates](#numbers).

```
platter 5 <px> <pz>
t <index> <hash> <heights line>
tw <index> <levels><types>
p <index> <hash> <heights line>
```

- `t`: a tile's rendition. `index` is the tile's place in the platter in plain decimal, `tz * 64 + tx`. `hash` is 16 hex digits. The heights are one [heights line](#heights) of the 81 corners in row order, `d` taking rows of 9.
- `tw`: the water of the tile before it: 64 parts' levels (3 digits each, written absolutely, `~~~` for dry), then their 64 types.
- `p`: a plate's rendition, as a tile's, `index` = `pz * 8 + px` within the platter.

### Older platters

Readers still take the gzipped binary platters written before (`client/src/v2/platterBinary.js`, versions 2 to 4), told apart by their first two bytes.

## Placed objects and slabs

A world keeps the objects and [slabs](#slabs) placed by hand in /create in a JSON file for each plate (2,048 ft square) that has any. Code: `client/src/create/placed.js`.

```
places/continents/<continent>/placed/<px>_<pz>.json
```

```json
{
  "version": 1,
  "objects": [
    { "type": "boulder", "at": [6150.5, 2040], "yaw": 1.2, "scale": 4, "colors": [[0.5, 0.48, 0.45]], "footprint": { "circle": 1.8 }, "height": 3.2 },
    { "type": "built:stool001", "at": [6152, 2041.5], "y": 43, "yaw": 0, "scale": 1, "template": "hut00001", "footprint": { "circle": 0.75 }, "height": 1.5 }
  ],
  "slabs": [
    { "at": [6150, 42, 2036], "turn": [0, 0, 0], "outline": [[0, 0], [16, 0], [16, 16], [0, 16]], "thickness": 1, "surface": "floorboards" }
  ]
}
```

### Which plate

Plate `(px, pz)` covers `[px * 2048, (px + 1) * 2048)` each way, in continent feet. An object is in the plate its `at` is in. A slab is in the plate its home corner is in: the north-most top corner, the west-most of those.

### Objects

- `type` is a built-in kind such as `boulder`, or `built:<id>` for one of the world's objects.
- `at` is `[x, z]` in continent feet.
- `y`, when there is one, is the height it stands at, as on a slab or a cave's floor. One hung from a cave's ceiling stands that far below it, its top at the ceiling. An object without one stands on what's under it.
- `yaw` is radians about up. `scale` is feet for a built-in kind, or a factor for a built object.
- `colors` are the object's color overrides: `"#rrggbb"` for a built object, `[r, g, b]` from 0 to 1 for other kinds. `texts` are signs on its flat faces.
- `template`, when there is one, is the template it was placed from.
- `cave`, when there is one, is the cave network it's in: the one whose 32 ft chunk it's in, under the ground there. /create keeps it as things are placed and moved, places or moves things into a network only while it's being polished, and takes them all away if it goes back to layout.
- `footprint` and `height` are what stands in the way, in feet, worked out from its type and scale when it's saved, so the game server needs no object library: `{ "circle": r }`, `{ "capsule": [r, half] }` along its own x, `{ "rect": [w, d] }`, or `{ "open": r }` for one that doesn't block. Files saved before they were kept leave them out, and the server works out a built-in kind's itself.

### Slabs in a placed file

Each is a [slab](#slabs), with `template` when it was placed from one, and `cave` as objects have it.

## Slabs

Slabs are flat pieces placed with `/create`'s build tools to walk on and to block movement and sight. Floors, ramps, walls and roofs are all slabs. A world keeps them in its [placed](#placed-objects-and-slabs) files. Code: `client/src/world/slabs.js`. [Schema](../docs/schema/slab.schema.json).

```json
{
  "at": [6150.5, 42, 2040],
  "turn": [30, -90, 0],
  "outline": [[0, 0], [12, 0], [12, 9], [0, 9]],
  "thickness": 1,
  "surface": "stoneBlocks"
}
```

### Shape

- `at` is a point on the slab's top face, `[x, y, z]` in continent feet.
- `outline` is the top face: 3 to 32 corners `[u, v]` in feet from `at`, u along x (east) and v along z (south) before the slab turns. It may be concave, but its edges don't cross.
- `holes`, when there are any, are up to 16 polygons in the outline's `[u, v]`, each 3 to 32 corners, going right through the slab, for doors and windows. Each is inside the outline, and touches neither it nor another hole.
- `thickness` is how far the slab goes down from its top face, more than 0 and at most 16 ft.
- `turn` is `[yaw, pitch, roll]` in degrees, applied roll, pitch, yaw, as an object piece's turn. Unturned, the top face is level and faces up. Pitch -90° stands a slab up into a wall, its outline's v pointing up and its thickness going south.

### Stairs

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

### Surface

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

### Which plate

A slab belongs to the plate holding its home corner: the north-most top corner, the west-most of those. Every corner, top and bottom, is within 64 ft of the home corner. So to find the slabs near a point, read the plates that touch a 64 ft square around it.

## Templates

A template is a group of [slabs](#slabs) and objects saved together, to place into the world as copies. A world keeps its templates as `templates/<id>.json`, each in one of the collections `template-collections.json` lists, as its objects are. The world never holds a template itself: placing one copies its slabs and objects into the placed files. The game ships built-in templates in read-only collections (`client/src/world/builtin/templates.json`). Code: `client/src/world/templates.js`. [Schema](../docs/schema/template.schema.json).

```json
{
  "id": "hut00001",
  "name": "Woodcutter's hut",
  "tags": ["wood", "small"],
  "collection": "tmpl0001",
  "slabs": [
    { "at": [0, 1, 0], "turn": [0, 0, 0], "outline": [[0, 0], [16, 0], [16, 16], [0, 16]], "thickness": 1, "surface": "floorboards" }
  ],
  "objects": [
    { "type": "built:stool001", "at": [6, 6], "y": 1, "yaw": 0, "scale": 1 }
  ],
  "ground": [[0, 0, 0], [1, 0, 0], [0, 1, 0.25], [1, 1, 0.5]]
}
```

### The anchor

Everything in a template is in feet from its anchor: a corner of an 8 ft grid, at the height the template stands on. x runs east and z south. Keeping the anchor on the grid means a template's ground lands on whole 8 ft cells, not the ground's 4 ft ones.

/create's templates tool saves what you've picked as a template (`captureTemplate`). It puts the anchor on the cell corner nearest the middle of what's picked, at the mean height of the ground under it. Placing one (`placedTemplate`) anchors it on a cell corner at the mean height of the ground under it there, turned about the anchor. Each slab and object it places has a `template` field holding the template's id. Turned off a quarter turn, its ground is read between its cells' middles.

### Fields

- `slabs` are slabs as placed files hold them, their `at` from the anchor.
- `objects` are placed objects as placed files hold them, `{ type, at: [x, z], yaw, scale, colors, texts }`, with `at` from the anchor. `y`, when there is one, is feet up from the anchor; an object without it stands on whatever's under it. A template can't hold another template.
- `ground`, when the template was saved with it, is the ground under it: `[i, j, height]` for each cell, cell `(i, j)` covering `i` to `i + 1` and `j` to `j + 1` cells from the anchor, its height in feet up from the anchor. It covers the cells inside the convex hull of the template's slabs and objects.

### Limits

- Up to 1024 slabs and objects together, none more than 1024 ft (128 cells) from the anchor.
- Each slab keeps a slab's own limits.
- At least one slab or object.

## Caves

A world keeps its caves in a text file for each plate (8×8 tiles, 2,048 ft square) that has any. Code: `client/src/v2/caves.js`, with readers in `game-server/internal/worlds/caves.go` and `lib/bot/caves.rb`.

```
places/continents/<continent>/caves/<px>_<pz>.caves
```

### What's kept

Under the ground everything is rock, except where a cave opens air. The caves are made of 2 ft voxels. Each 2 ft column of a tile with caves keeps its air as spans, lowest first, so ledges, arches and caves over caves are just more spans. A span has:

- a start, the height of its floor, a multiple of 2 ft.
- a length, how far up its ceiling is, a multiple of 2 ft under 1,024 ft.
- three stone types: its ceiling's, its walls' and its floor's.
- the cave network it's in.

Every cave is in a named network. A network's name is a slug: lowercase letters and digits in words joined by hyphens, such as `wailing-hollow`. Each 32 ft chunk of the caves belongs to one network, all the way down, so one network can't run above another. /create refuses a carving that would put a second network in a chunk.

A stone type is a theme, 0 jagged, 1 smooth, 2 carved or 3 mined. Readers take older files' 4 to 7 as the theme less 4. Where the rock faces up it takes the floor type of the nearest span, where it faces down the ceiling type, and where it faces sideways the wall type.

Only an entrance in the [cave layout](#cave-layout) may reach up through the ground.

### Smooth floors

Floors are walked on and drawn smooth, not as the voxels' 2 ft steps. Nothing about it is kept in the file; readers work it out from the spans, the same way everywhere (`smoothFloor` and `floorAt` in `client/src/v2/caves.js`):

- A floor's smoothed height is the mean of the floors joined to it within 2 columns each way, its own included, kept within 2 ft of its own. A floor in another column joins it where it's within 2 ft for each column away and their air overlaps. A bigger drop is a ledge, and stays sharp.
- Between the middles of columns, the floor runs evenly from one smoothed height to the next. A column beside it with no floor joined within 2 ft takes the floor's own.

### Mouths

Where an entrance opens through the ground, the caves draw the ground near it, not the ground's own mesh. Each 4 ft ground cell with an open column in it, or next to one, is drawn by the caves: a 2 ft square for each column that's still closed, on the ground's heights, in the ground's look. Open columns are left out, so the mouth is a hole in the ground with the cave behind it. Nothing about mouths is kept in the file; they come from the spans.

### Numbers

Numbers are base64 digits, as in [plates](#numbers): `A`–`Z` `a`–`z` `0`–`9` `+` `/` stand for 0 to 63, most significant digit first. Heights and lengths are in quarter feet. A height written absolutely is the height plus 32,768.

### Layout

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

#### `c3`: anything

`c3 <counts> <spans>`

- `counts`: 16,384 digits, how many spans each column has, in row order from the northwest.
- `spans`: every span, column by column, lowest first, 11 digits each with no breaks: types, a 6-digit start written absolutely, and its length.

#### `c2`: starts within 1,024 ft

`c2 <base> <counts> <spans>`

- `base`: the tile's lowest span start, 3 digits, written absolutely.
- `counts`: the columns in row order. A digit 0 to 31 is how many spans the next column has. A digit 32 to 63 stands for that many less 30 empty columns in a row (2 to 33).
- `spans`: every span, as in `c3`, but 7 digits each: its start is 2 digits over the base.

No column may have more than 31 spans.

#### `c1`: few spans

`c1 <count> <span> <span> ...`

- `count`: how many spans, 2 digits.
- Each span, after a space: its column's index in row order within the tile, 3 digits, then 11 digits as in `c3`. A column's spans come lowest first.

#### Zipped

`c1z`, `c2z` and `c3z` are followed by a space and a zstd frame in base64 (3 bytes to 4 digits, the last group short). Unzipped, it's what follows `c1`, `c2` or `c3`.

## Cave layout

A world keeps the layout of each continent's caves: its cave networks, and in each, the entrances, points and segments that carving opens into the [caves](#caves) files. /create's place entrance tool (J, in caves) edits it. Code: `client/src/create/caveLayout.js`, `client/src/create/cavePlan.js`. [Schema](../docs/schema/cave-layout.schema.json).

```
places/continents/<continent>/caves/layout.json
```

Its `version` is 2. /create drops a layout of version 1, from before networks, when it reads one, as it drops the caves files from then, and saves an empty one in its place. The game server doesn't read this file.

### Networks

`networks` lists the cave networks, each `{ slug, phase }`.

- `slug`: the network's name, lowercase words of letters and digits joined by hyphens, such as `wailing-hollow`. The caves files name it on each of its tile lines.
- `phase`: `layout`, while its passages are laid out and carved again as they change, or `polish`, once it's burned in. A burned in network's layout stays as it was, and its rock isn't carved again, so hand edits to it are kept. Unlocking it clears all its air and carves its layout again from nothing.

Every element below has a `net`, the slug of its network, and an `id`: `e`, `p` or `s` and a number.

### Entrances

A network starts from an entrance: a tube from its `mouth`, the middle of the mouth's floor on a hillside, level or sloping into the hill, to its `point`, a point at its far end that passages go on from.

- `yaw`: the way the tube runs in, in degrees, 0 toward +z, 90 toward +x.
- `length`: how far in the far end is, in feet across: 16, 32, 48 or 64.
- `slope`: `level`, or `down`, dropping 1 ft for every 5 in.
- `width`: the tube's width and height in feet, 8 to 24.
- `style`: `natural`, round, or `mine`, square.
- `rock`: the rock's theme, 0 jagged, 1 smooth, 2 carved, 3 mined.

Its point's `at` is always where `mouth`, `yaw`, `length` and `slope` put it. Its mouth has to be out in the open, all but the bottom quarter of its rim, and its far end under the ground, at least 4 ft.

### Points

A point holds the config of the passage round it. Its `at` is the middle of the passage's floor there, in feet.

- `width` and `height`: the passage's, in feet.
- `qualities`: a list of the qualities its section has: `twisty` or `very twisty`, `bumpy`, `ledges`, `cluttered`, `offshoots` and `switchbacks`. Each shapes the point's half of each segment on it, fading across the middle where the segment's two points differ.
- `rock`, as for entrances.

### Segments

A segment joins two points, `from` and `to`, with a passage.

### Carving

A segment carves a tube from its `from` point's floor to its `to` point's, its width and height easing from one point's to the other's. An entrance's tube opens through the ground wherever it would have less than 1 ft of rock over it. Air whose floor is over the ground isn't carved. All other air stops 4 ft under the ground, and a segment that would come that near it isn't carved. /create carves each change as it's made. Everything an element carves is in its network.

`carved` keeps each entrance and segment as it was when last carved, by id: a copy of it, a segment's with `ends`, copies of its two points, and `near`, copies of the other points within 3 segments of them, by id. With `offshoots` on either point, it adds `others`: the ends of the segments in its network whose passages come within 68 ft of it, which its side passages keep 8 ft of rock from. A segment's shape can depend on those points and nothing further, and any randomness in it is seeded from its id alone. An element is carved again when its copy now differs from the one kept, so a change to a point carves again the segments within 3 of it. Carving a changed one fills its old shapes with rock, then opens its new ones, and carves again its unchanged neighbours that the fill touched.

Shapes are domes, `{kind: "dome", at, radii: [rx, ry, rz], yaw}`, a half ellipsoid whose `at` is the middle of its flat floor, and boxes, `{kind: "box", at, half: [x, y, z], yaw}`.

## Biomes, planning marks and water

Each continent has one of each, all in continent feet.

`biomes.json` (`client/src/create/biomes.js`) holds the areas as drawn. /create and the play page read it. Each cell's biome is baked into [plates](#biomes) as `b` lines, and those are what pick a tile's trees, which block walking on the game server:

```json
{ "version": 1, "areas": [{ "biome": "forest", "points": [[0, 0], [64, 0], [64, 64]] }] }
```

`planning.json` (`client/src/create/marks.js`) holds what a builder draws to plan with. Line `width` is 1 to 4:

```json
{ "version": 1, "lines": [{ "points": [[0, 0], [64, 0]], "color": "red", "width": 2, "style": "solid" }], "pins": [] }
```

`water.json` is `{ "version": 1, "bodies": [...], "courses": [...] }`. A body (`client/src/v2/water.js`) is `{ type, level, points }`, standing at `level` ft over the cells in its outline whose ground is lower. Courses are in `client/src/v2/courses.js`. Both are baked into [plates](#water) as each cell's water. The sea lives only in the plates, at sea level.

## Bodies

A body is a creature's shape on one skeleton, and the ranges and colors each creature with that body picks its look from. The game ships its bodies as one file each. Code: `client/src/character/bodies.js`. [Schema](../docs/schema/body.schema.json).

```
client/src/character/bodies/<body>.json
```

```json
{
  "skeleton": "feline",
  "scale": 1.34,
  "reach": 2.8,
  "shape": { "H": 1.9, "L": 2.75, "head": 1.7, "ears": "cat", "tail": "cat" },
  "look": { "build": [0.45, 0.7] }
}
```

- `skeleton`: which builder makes the body, and so which bones and clips it has.
- `scale`: the body's default size against its shape's. A creature stands at the height its builder shapes, times this, times its own `scale` (see [game data](#game-data)). A humanoid's shape is 6 ft tall.
- `reach`: how far the body reaches from its middle at its default size, in feet: the circle that ranges are measured from and that's drawn under it as a target. It takes in the bulk of the body, and heads, tails and wings can poke out of it. No reach is under three quarters of the body's height, up to 4.5 ft at 6 ft tall, and half a foot more for each foot taller, so a humanoid's is a player's. A creature's reach grows with its scale.
- `shape`: the builder's settings for this body. Each skeleton takes its own, listed at the top of its builder.
- `look`: a recipe's settings (see [game data](#game-data)), as ranges and lists that each creature picks from. A humanoid body has no `shape`; its look's settings (ears, horns, tail and the rest) are its shape.

| Skeleton | Builder | Bodies |
| --- | --- | --- |
| `humanoid` | `body.js` | goblin, orc, troll and the other folk |
| `canine`, `feline`, `ursine`, `hoofed`, `lizard`, `pachyderm` | `quadruped.js` | four-legged bodies |
| `dragon` | `dragon.js` | dragon, wyvern |
| `serpent` | `serpent.js` | snakes, centipede, eel, coatl |
| `fish`, `ray` | `fish.js` | swimmers |
| `bat` | `bat.js` | bat |
| `crawler` | `crawler.js` | spiders, insects, crab |
| `slime` | `slime.js` | slime, wisp |
| `bird` | `bird.js` | birds |
| `strider` | `strider.js` | raptor, tyrant, ostora |
| `eyeshaug` | `eyeshaug.js` | eyeshaug |

Shape settings that name a part, like `ears: "cat"` or `tail: "bushy"`, pick from the parts the builder knows.

### Patterns and colorations

A body's `patterns` say how its areas are painted, and its `colorations` fill a pattern's colors. Each creature wears one coloration: the one its recipe names in `coloration`, or one picked by `weight` (1 by default). A recipe's `colors` go over the coloration's by name. Code: `client/src/character/paint.js`.

```json
"patterns": {
  "striped": {
    "colors": { "pupil": "#141212" },
    "groups": { "striped": ["coat", "back", "crown", "tail"] },
    "areas": {
      "everything": "coat",
      "lower": "belly",
      "striped": { "color": "coat", "marks": [{ "kind": "stripes", "color": "stripe", "width": 0.07, "gap": 0.09 }] },
      "eyes": "eyes",
      "pupils": "pupil"
    }
  }
},
"colorations": [
  { "name": "bengal", "pattern": "striped", "weight": 3, "colors": { "coat": "#d07a2a", "stripe": "#120e0b", "belly": "#e6c39c", "eyes": "#c8a040" } }
]
```

- A body made for one kind of animal has a few colorations named for what they look like ("bengal", "white"). A body for a folk, like goblins, has many, numbered ("goblin 1"). A body for one very particular creature, like an elephant, has one.
- A pattern's colors are the names its rules use, up to 10. Its `colors` give defaults, and a coloration's go over them.
- The builder tags every face with an area. `groups` name sets of areas and other groups. The skeleton has its own groups, and a body or pattern can add more. No group shares an area's name.
- An area takes its own rule, or else the rule of the smallest group holding it that has one, or else the color of its own name.
- A rule is a color's name, a `#rrggbb` color, or `{ color, tone, shade, marks }`:
  - `tone` lightens (over 1) or darkens (under 1) it.
  - `shade` makes each face up to that much lighter or darker, at random.
  - `marks` paint over it where they fall, each with its own `color` and `tone`. Sizes are shares of the body's height.
    - `speckled`: single faces, `amount` of them (0 to 1).
    - `spots` and `patches`: blobs `size` across, covering `amount` of the area.
    - `stripes`: `width` wide with `gap` between, `across` the body: `vertical` (the default), `horizontal` (which rings the legs) or `diagonal`. `wave` makes them waver and `break` breaks some off.

### A world's models

A world can have bodies of its own, and add patterns and colorations to the bodies the game ships, all in one file, `models.json`. Every continent shares it. Body names are lowercase letters, digits and dashes.

- `bodies`: the world's own bodies by name, each a whole body in the format above. A world never changes a shipped body. To make a variant of one, copy it here and edit the copy, under its own name or the shipped one's.
- `colorations`: by a shipped body's name, `patterns` and `colorations` to add to it. Its colorations can use the body's patterns or the ones it adds, and can't take a name the body's colorations already have.

```json
{
  "bodies": { "dire-wolf": { "skeleton": "canine", "scale": 1.6, "shape": { "...": "a copy of the wolf's" } } },
  "colorations": {
    "tiger": {
      "patterns": { "plain": { "areas": { "everything": "coat", "eyes": "eyes", "pupils": "pupil" }, "colors": { "pupil": "#141212" } } },
      "colorations": [{ "name": "ghost", "pattern": "plain", "colors": { "coat": "#e8eef4", "eyes": "#80b0d0" } }]
    }
  }
}
```

A creature's `"body": "tiger"` is the world's own tiger if it has one, or else the shipped tiger. `"body": "core:tiger"` is always the shipped tiger. A world's colorations for a shipped body reach it under both names. Pickers mark a world's own bodies as custom, and list the shipped body it took the name of as `core:<name>`. The monster lab (`/monster_lab?world=owner/repo`) reads a world's `models.json` from GitHub and shows its bodies beside the shipped ones.

#### Four-legged areas

| Group | Areas |
| --- | --- |
| `body` | coat, back, belly |
| `head` | face, crown, muzzle, jaw, nose, ears |
| `limbs` | legs, shins, paws, hooves |
| `tails` | tail, tailTip, tuft |
| `bone` | horns, antlers, tusks |
| `upper` | back, crown, ears, mane, spines, `tails` |
| `lower` | belly, muzzle, jaw, `limbs` |
| `everything` | all of the above, and mane, beard, spines, eyes, pupils, shell, plastron, cap, gills, trunk, beak |

#### Other skeletons' areas

Each has one group, `everything`, holding all its areas.

| Skeleton | Areas |
| --- | --- |
| `dragon` | scales, belly, horns, eyes, dark, teeth |
| `serpent` | scales, belly, markings, eyes, dark, teeth |
| `fish`, `ray` | back, belly, fins, eyes, dark, teeth |
| `bat` | fur, wings, claws, eyes, dark, teeth |
| `crawler` | carapace, markings, claws, eyes, dark, wings |
| `slime` | jelly, eyes, dark, eyeWhites |
| `bird` | plumage, belly, beak, eyes, dark, comb |
| `strider` | hide, markings, claws, eyes, dark, teeth |
| `eyeshaug` | hide, mouth, eyes, eyeWhites, dark, teeth |

#### Humanoid areas

A humanoid's areas are its look's color slots, and an area with no rule takes the color of its own name. A humanoid unit's colorations fill its body's colors: skin, hair, eyes, horn and leaf. Its clothes and gear take its look's and loadouts' `colors`. Player characters have no colorations; they're painted by their look's colors.

| Group | Areas |
| --- | --- |
| `flesh` | skin, hair, eyes, horn, leaf |
| `clothes` | primary, secondary |
| `gear` | metal, steel, wood, paint |
| `everything` | `flesh`, `clothes`, `gear` |

## Game data

The game server and `/classes` read classes, as [Combat](#combat) describes, and nothing reads the rest yet, so this section is their only definition. What a world defines for combat: classes, abilities, statuses, items, creatures, NPCs, dialogue and spawns. Each is a JSON file in the world, with a schema in [docs/schema](../docs/schema). The rules follow the genre's modern standard as closely as we can: its stats, rating conversions, attack table, GCD and resources.

| Path | What it is | Schema |
| --- | --- | --- |
| `classes/<id>.json` | a class players can pick | [class](../docs/schema/class.schema.json) |
| `abilities/<id>.json` | something that isn't a class's own: for items, or for every character | [ability](../docs/schema/ability.schema.json) |
| `statuses/<id>.json` | a buff, debuff or hidden effect that isn't a class's own | [status](../docs/schema/status.schema.json) |
| `items/<id>.json` | an item, written by hand | [item](../docs/schema/item.schema.json) |
| `item-templates/<id>.json` | a pattern the server rolls gear from | [item template](../docs/schema/item-template.schema.json) |
| `creatures/<id>.json` | a kind of mob | [creature](../docs/schema/creature.schema.json) |
| `npcs/<id>.json` | a friendly character who talks or sells | [npc](../docs/schema/npc.schema.json) |
| `dialogues/<id>.json` | a dialogue tree | [dialogue](../docs/schema/dialogue.schema.json) |
| `places/continents/<c>/spawns.json` | the continent's spawn regions, placed mobs and NPCs | [spawns](../docs/schema/spawns.schema.json) |

Ids are 8 lowercase base-36 characters, and a file's id matches its name. Files point at each other by id. Every file, and each spawn region and placed mob or NPC, can have `notes`: what it's for and its backstory. The game never reads them. Distances are feet, times are seconds, angles are degrees, and money is copper (100 copper make a silver, 100 silver a gold).

`world.json` sets `levelCap`, 1 to 20 for now.

### Amounts

Damage, healing and absorbs take an amount, one of:

- a number, or `[min, max]` to roll between;
- `{ base, attackPower, spellPower, weapon, mastery, maxHealth, shareOfTrigger, perSpent }`, any of them, added up: `base` is a number or `[min, max]`, `attackPower` and `spellPower` are coefficients of the caster's power, `weapon` a coefficient of a main-hand weapon swing, `mastery` an amount per point of the caster's mastery percentage, `maxHealth` a share of the maximum health of whoever it affects, `shareOfTrigger` a share of the hit or heal that set off the trigger or applied the status, and `perSpent` an amount for each point spent (see [Abilities](#abilities), `cost`).

Power grows with level and gear, so an ability gets stronger as you level without new ranks. A creature has attack and spell power from its level, so the same ability works on a mob.

### Distance and areas

Every unit has a `reach`, how far its body extends from its center: 4.5 ft for a player, and for a creature its `reach`, or one from its body and size. Ranges run from your edge to the target's, so a big target is easier to reach. Range is measured in 3D, so height counts.

Melee is `"melee"` rather than a number: you reach the target when you're within your reach plus its reach plus 4 ft, and never less than 15 ft.

An area is a cylinder: `radius` across, and `height` above and below its center, 15 ft by default. It only takes in units with line of sight from its center.

### Schools

`physical`, `holy`, `fire`, `nature`, `frost`, `shadow` and `arcane`. Armor reduces physical damage only.

### Classes

```json
{
  "id": "m0nk0001",
  "name": "Monk",
  "colors": { "major": "#2e7d5b", "minor": "#e8d8a0" },
  "primaryStats": ["agility"],
  "resources": [
    { "key": "energy", "name": "Energy", "kind": "energy", "color": "#f0d040" },
    { "key": "ki", "name": "Ki", "kind": "points", "color": "#80e0c0", "max": 5 }
  ],
  "armor": [{ "type": "cloth", "level": 1 }, { "type": "leather", "level": 1 }],
  "weapons": ["fist", "staff", "polearm"],
  "offhands": ["fist"],
  "abilities": [{ "id": "jab00001", "level": 1, "name": "Jab", "target": "enemy", "range": "melee", "effects": [{ "type": "damage", "affects": "target", "amount": { "attackPower": 0.5 } }] }],
  "statuses": [
    { "id": "flow0001", "name": "Flow", "kind": "hidden", "effects": [{ "type": "stat", "stat": "dodge", "add": 5 }] },
    { "id": "cntr0001", "name": "Centered", "kind": "hidden", "effects": [{ "type": "stat", "stat": "damageDone", "multiply": 1.1 }] }
  ],
  "passives": [{ "status": "flow0001", "level": 1 }],
  "mastery": { "name": "Centered", "description": "Your strikes hit harder the more ki you hold.", "status": "cntr0001" },
  "startingGear": ["wrap0001", "fist0001"]
}
```

- `primaryStats`: one or more of `strength`, `agility` and `intellect`. A hybrid lists the ones its roles use. Gear rolled for the class uses the first.
- `resources`: one to three. The first is the primary resource, and the UI shows all of them. `kind` sets the rules:
  - `mana`: its maximum comes from level, and it regenerates over time.
  - `energy`: 100, regenerating 10 a second, faster with haste.
  - `rage`: 100, built by dealing and taking damage, decaying out of combat.
  - `points`: whole points up to `max`, like ki or combo points. Abilities build and spend them. `regen` adds that many a second (astra's is `1/9`, so about a point every 9 s), and `decay` drains that many a second out of combat.
- `armor`: what it can wear, each with the level it unlocks at. A paladin lists `chain` at 1 and `plate` at 40.
- `weapons` and `offhands`: weapon types from `client/src/character/weapons.js` (`HELD`) that it can use.
- `abilities`: the class's own [abilities](#abilities), written out here, each with the `level` it's granted at. A class's abilities don't generalize to others, so they aren't shared.
- `statuses`: the [statuses](#statuses) its abilities, passives and mastery apply. They point at them by id, unique within the class.
- `units`: what it summons, written out here so a class needs nothing from outside itself. A unit takes `id`, `name` and a creature's `look`, `creatureType`, `reach`, `attack` and `speed`, plus `abilities` from the same class and `autocast`, those it uses on its own when it obeys you. `power` gives it shares of its summoner's `attackPower`, `spellPower`, `health` and `armor`. Its level, crit, haste, mastery and versatility follow its summoner's.
- `passives`: statuses it has from their `level`. They never expire, and hidden ones don't show.
- `mastery`: one mastery effect, a status the class always has, whose amounts use `mastery`.
- `startingGear`: items a new character starts with.

Only a class's `id` and `name` are required for now, so the class editor can save one as it's built. Every class has auto-attack from its weapons. The UI shows at most 12 of its abilities on the action bar.

### Abilities

```json
{
  "id": "frst0001",
  "name": "Ice Bolt",
  "icon": "ice-bolt",
  "school": "frost",
  "target": "enemy",
  "range": 120,
  "castTime": 2,
  "cost": [{ "resource": "mana", "percent": 2 }],
  "speed": 70,
  "effects": [
    { "type": "damage", "affects": "target", "amount": { "spellPower": 1.1 } },
    { "type": "status", "affects": "target", "status": "chil0001" }
  ],
  "visuals": [{ "effect": "bolt", "when": "launch", "colors": ["#a0d8ff", "#ffffff"] }],
  "sounds": [{ "sound": "frost-cast", "when": "cast" }, { "sound": "frost-hit", "when": "impact" }]
}
```

- `target`: what you need targeted to use it. `enemy` or `ally`, or `self`, `ground` (you pick a place within range) or `none`. An `ally` ability with no friendly target lands on you.
- `icon`: its action bar icon, from the stock set the core world ships.
- `range`: how far the target can be, a number or `"melee"` (see Distance and areas). `minRange` is how near it can be.
- `requires`: conditions to use it, each `{ health, below or above }` (`health` is `self` or `target`, in percent) or `{ status, on, stacks }` (a status `on` `self` or `target`, with at least `stacks` stacks if it says), or `{ targetIs }` (what you're using it on: `enemy`, `ally`, `self`, `other`, `player` or `nonPlayer`), or `{ stealthed }` or `{ inCombat }` (true or false, about you), or `{ anyOf: [conditions] }`, which holds when any of them does, or `{ not: condition }`, which holds when it doesn't. An execute needs `{ "health": "target", "below": 20 }`.
- `creatureTypes`: the creature types it can target, for an ability that only works on beasts, say.
- `facing`: you must face the target within 90° either side. True by default for `enemy` abilities.
- `castTime`: 0 is instant. Moving or jumping cancels a cast unless `castWhileMoving` is true.
- `channel`: `{ duration, ticks, effect }`. You keep casting for `duration` and the effects land on each tick, or just `effect` if it has one, with the ability's `effects` landing once at the start. Moving cancels it too.
- `gcd`: 1.5 by default, and haste shortens it to no less than 0.75. `gcd: 0` is off the global cooldown. `gcdHasted: false` keeps it fixed, as energy users' is (1 s).
- `cooldown`, `charges` and `cooldownHasted`: its own cooldown, how many uses it stores, and whether haste shortens it.
- `cost`: what it spends, each `{ resource, amount }`, or `{ resource: "mana", percent }` of base mana. You can't use it without enough. `all: true` spends all you have of it, needing at least that much. An ability can have one such cost, and what it spends is the "points spent" that `perSpent` amounts, `durationPerSpent` and a status's `addPerSpent` and `multiplyPerSpent` count. A finisher costs `{ "resource": "combo", "amount": 1, "all": true }`.
- `speed`: a projectile's speed. Its effects aimed at the target land when it arrives, and fizzle if the target dies first.
- `school`: the school of its damage, unless an effect says otherwise.
- `effects`: what it does, below.
- `visuals` and `sounds`: what plays, from the stock sets the core world ships. Each picks an `effect` or `sound`, `when` it plays (`cast`, `launch`, `impact` or `channel`), and `on` (`caster`, `target` or `ground`, the target by default for impacts). Visuals take `colors` and `scale`, and sounds take `volume` and `pitch`, each 1 by default.
- `tags`: free-form words for sorting, and for a status's `modify` to pick abilities by.

#### Effects

Each effect has a `type` and an `affects`:

- `target`: whoever you targeted, or the place, for `ground`.
- `self`.
- `enemies` or `allies`: everyone of that side in an area (see Distance and areas) of `radius` and `height` around `around` (`self`, `target` or `ground`; `self` by default). `cone` narrows it to a slice that many degrees wide in front of you, around yourself only. `max` caps how many it hits, nearest first.

Types:

- `damage`: `amount`, and `school` to override the ability's.
- `heal`: `amount`.
- `resource`: gives `amount` of `resource` (negative takes it).
- `status`: applies `status`, for its own duration unless `duration` says otherwise, and `durationPerSpent` seconds more for each point spent. Amounts in the status's effects count the points this ability spent.
- `interrupt`: stops a cast, and locks its school out for `lockout` seconds.
- `dispel`: removes up to `count` statuses, 1 by default, of the kinds `dispels` lists.
- `cooldown`: changes the caster's cooldowns on `abilities`, by id from the same class, or on abilities with this `tag`. `by` takes that many seconds off, `reset` makes them ready with every charge, and `charges` gives back that many charges.
- `summon`: brings `unit`, `count` of them, for `lasts` seconds, or until it dies or is dismissed if that's left out. `max` is how many can be out at once. `obeys` means you command it. `statuses` are what it arrives with.
- `command`: your summons, or just `units`, use `ability`.
- `source: "summons"`, on a damage or heal effect: your summons do it, not you.
- `category`, on a damage or heal effect or a periodic: a word the class picks, like `bleed` or `disease`. A `stat` or `trigger` with `category` or `categories` only counts those.
- `consume`: takes `status` off those it `affects`, or just `stacks` stacks of it. It's for an ability using up a status of its own, where `dispel` removes by kind. With `affects: "summons"` it dismisses or sacrifices summons instead, `units` and `count` saying which and how many.
- `chance`, on any effect, 0 to 1: how likely it is to happen, 1 by default. `chancePerSpent` adds that much for each point spent, here and on a `trigger`.
- `when`, on any effect: conditions written as `requires`. The effect only happens while they hold.
- `prefers`, on an effect with `max`: which it picks first, `nearest` by default, or `injured`, `farthest` or `lowestHealth`.
- `perCount`, on any effect or stat: its number counts once for each of something, up to `max`. Pick `statusStacks` (stacks of that status), `statusesFromMe` (statuses you've put on the target), `statusesOnTarget` (which of those the target has), `unitsOut` (how many of those units you have out) or `resource` (how much of it you have). `add` makes each count add that much, not the whole number again.
- `softCap`, on any effect that hits several: past this many hit, those hit share this many's worth, split evenly.
- `perTargetHit`, on any effect: its amount, or a `cooldown` effect's `by`, counts once for each one the ability hits. `maxTotal` is the most it can come to.
- `exceptTarget`, on any effect: leaves the ability's target out of those it `affects`.
- `resurrect`: brings a dead ally back, with `health` percent of its health.
- `taunt`: makes a mob attack you for `duration`.
- `move`: moves someone, as `kind` says. `to` is where it goes when that isn't plain: `self`, `target` or `ground`. The kinds:
  - `dash`: forward, in a straight line.
  - `leapBack`: backward, through the air.
  - `knockup`: straight up, landing where it stood.
  - `behind`: to the back of the target.
  - `charge`: you run to the target at `speed`, stopping in melee range.
  - `leap`: you jump to the target or the ground point, arcing `height` ft up.
  - `knockback`: knocks those it `affects` `distance` ft away from you, `height` ft up.
  - `pull`: pulls those it `affects` to you.
  - `blink`: puts you `distance` ft forward, short of anything in the way.

  The server moves them, and their client follows.

A class's abilities live in its file. `abilities/<id>.json` is for those that aren't a class's own, like an item's or one every character has, and creatures point at them by id. Those files leave out `level`.

### Statuses

```json
{
  "id": "chil0001",
  "name": "Chilled",
  "icon": "chilled",
  "kind": "debuff",
  "dispel": "magic",
  "duration": 8,
  "stacking": "refresh",
  "effects": [{ "type": "stat", "stat": "movementSpeed", "multiply": 0.5 }]
}
```

- `kind`: `buff` or `debuff`, shown on unit frames with its `icon`, or `hidden`.
- `dispel`: `magic`, `curse`, `poison`, `disease` or `enrage`, or left out if it can't be dispelled.
- `duration`: how long it lasts, unless whatever applies it says otherwise. Leave it out for one that lasts until something removes it.
- `stacking`: what happens when it lands again. `refresh` resets the duration (and keeps up to 30% of what was left), `replace` starts it over, and `stack` adds a stack up to `maxStacks`, refreshing the duration. Effects scale with stacks.
- `breaksOn`: any of `move`, `damage` and `action` (using an ability or attacking). Food and drink break on `move` and `damage`, and stealth on `damage` and `action`.
- `consumedBy`: ends it when the holder uses one of these `abilities`, by id from the same class, or an ability with this `tag`. A `modify` on the status still changes that use. `uses` makes it last that many uses, for "your next 3". `stacks` takes that many stacks each use, instead of ending it. The ability doesn't know about it.
- `pose`: `sit` sits you down while it lasts.
- `aura`: a visual on the unit while it lasts, `{ effect, colors }`.

Effects:

Any effect can have `when`, conditions written as an ability's `requires`, checked as the fight goes. It only works while they hold.

- `stat`: changes `stat` by `add` or `multiply`, and `addPerSpent` or `multiplyPerSpent` more for each point spent by the ability that applied it. `school` or `schools` limits a damage or healing stat to those schools, and `abilities`, `tag`, `statuses` and `hit` narrow it the way they narrow a `trigger`. With `statuses` it changes the damage or healing those statuses do. `casterOnly`, on a status you put on someone, limits it to what passes between its holder and the one who applied it, so `damageTaken` counts only what that caster does to the holder, and `damageDone` only what the holder does to that caster. Stats:
  - from gear: `strength`, `agility`, `intellect`, `stamina`, `armor`, `critRating`, `hasteRating`, `masteryRating`, `versatilityRating`, `leechRating`, `avoidanceRating` and `speedRating`;
  - worked out from those: `attackPower`, `spellPower`, `maxHealth`, `critChance`, `critDamage`, `haste`, `mastery`, `versatility`, `leech`, `avoidance`, `dodge`, `parry`, `block`, `movementSpeed`, `attackSpeed`, `stealth` and `detection` (in levels), where percentages add in points;
  - outcomes: `damageDone`, `healingDone`, `damageTaken`, `healingTaken` and `threat`, which multiply.
- `periodic`: every `every` seconds (shorter with the caster's haste), does `damage`, `heal` or `resource` by `amount`. `school` and `resource` as for ability effects.
- `absorb`: soaks up `amount` of damage, of `schools` if it lists them, then ends.
- `control`: one of `stun`, `root`, `silence`, `incapacitate`, `disorient`, `fear` and `disarm`. Damage breaks incapacitate, disorient and fear.
- `trigger`: when `on` happens, with `chance` (0 to 1, 1 by default), at most once each `cooldown` seconds, applies `effect`, an ability effect that `affects` `self` or `target`. `on` is one of:
  - The holder's hits: `dealDamage`, `takeDamage`, `heal`, `healed` (something heals it), `overheal`, `crit`, `nonCrit`, `dodge`, `parry`, `block`.
  - The holder's actions: `cast`, `channelEnd`, `spend` (it spends a resource), `kill`, `interrupt`, `dispel` (it removes a status), `pickup`.
  - Health: `healthBelow` or `allyHealthBelow`, when the holder or an ally drops below `threshold` percent, and `wouldDie`, when a hit would kill the holder.
  - A status's life: `statusGained`, `statusConsumed`, `statusEnds`, `dispelled` and `holderDies`. Name the statuses in `statuses`, or leave it out to mean this status.
  It can be narrowed, and each filter it has must match. `abilities` or `tag` limits it to those abilities, `statuses` to those statuses, by id from the same class, and `school` or `schools` to those schools. `hit` limits it to a kind of hit: `auto` (a weapon swing), `ability` (not a swing), `melee`, `direct` (not periodic), `periodic`, `area`, `main` (the ability's target), `others` (not its target) or `single` (the only one hit). `atTargets` needs the ability to hit at least that many. `source` says whose stat or hit it is: `self` by default, `summons`, or `both`, and `units` narrows it to those. `casterOnly`, on a status you put on someone, limits it to what the one who applied it does. `atStacks` needs at least that many stacks of the status, for `statusGained` and `statusConsumed`. `full` needs a channel to run its whole length. `pickup` limits it to a kind of pickup, and `resource` to spending that resource, by key.
- `stealth`: hides the holder. Others see it only when they detect it, which depends on how near it is, whether they face it, and the gap between its level plus its `stealth` stat and their level plus their `detection` stat. Undetected, it can't be targeted, but areas still hit it. Entering combat, or being hit, ends the status. Stealth's slower movement is a `movementSpeed` stat effect beside it.
- `modify`: changes abilities the holder uses while it's on, as `stat` changes a stat. The ability itself doesn't know about it. `abilities` picks them by id, from the same class, and `tag` picks all with that tag. Then either:
  - `change` says what changes, by `add`, `multiply` or `set` (`set` goes first, then `add`, then `multiply`). `cost` covers each thing it spends, `cooldown`, `castTime` and `charges` are its own, `cooldownRate` is how fast its cooldown runs while the status lasts, `tickRate` is how fast its periodic or channel ticks, `channelDuration` and `channelTicks` are its channel's, `range` and `radius` are in feet, `maxTargets` is the `max` of its area effects, `duration` is how long the statuses it applies last, `damage` and `healing` are what its effects do, and `critChance` and `critDamage` add in points. One `modify` makes one change, so two changes are two effects, like `{ "type": "modify", "abilities": ["frst0001"], "change": "cooldown", "add": -2 }`.
  - `addEffects` lists more ability effects for them to do.
- `modify` of `statuses`: changes statuses, by id, from the same class, instead of abilities. `change` is `duration` or `maxStacks`, by `add`, `multiply` or `set`, or `statusEffects` lists more effects for them to have, like `{ "type": "modify", "statuses": ["chil0001"], "change": "duration", "add": 2 }`.
- `immune`: the holder is immune to `controls` (`stun`, `root`, `silence`, `incapacitate`, `disorient`, `fear`, `disarm`, `slow`, `interrupt`, `knockback`, `pull`, `pushback`, `charm`, `sleep`), to damage from `schools`, to everything with `all`, or to harmful statuses with `harmful`.
- `param` on an effect names its number, so a `modify` can change just that number: `{ "type": "stat", "stat": "damageTaken", "multiply": 0.8, "param": "reduction" }` on a status, and `{ "type": "modify", "statuses": ["bark0001"], "change": "reduction", "add": -0.1 }` on a talent. Ability effects can have one too, for a `modify` of `abilities`. The number is a stat's `add` or `multiply`, or its `share` with `fromStat`, the `amount` of a periodic, absorb, damage or heal effect, and a trigger's `chance`. An `amount` that's an object takes `multiply` and `set`, not `add`. Several talents changing one `param` all count, in the `set`, `add`, `multiply` order.
- `none`: nothing, for a status other things look for by name.

### Items

```json
{
  "id": "wrap0001",
  "name": "Initiate's Wraps",
  "icon": "leather-chest",
  "quality": "common",
  "itemLevel": 5,
  "requiredLevel": 1,
  "slot": "chest",
  "armorType": "leather",
  "stats": { "agility": 2, "stamina": 2 },
  "colors": ["#6b4a2e", "#c8b070"],
  "price": 120
}
```

- `icon`: its bag and tooltip icon, from the stock set. `description` is flavor text on the tooltip.
- `quality`: `poor` (junk), `common`, `uncommon`, `rare` or `epic`.
- `itemLevel` sets armor and weapon damage, which the server works out. `requiredLevel` is the level you need to equip it.
- `slot`: `head`, `neck`, `shoulders`, `back`, `chest`, `wrists`, `hands`, `waist`, `legs`, `feet`, `finger`, `trinket`, `oneHand`, `mainHand`, `offHand`, `twoHand` or `ranged`. Leave it out for an item you don't wear.
- `armorType`: for the six armor slots with a model (`client/src/character/armor.js`, `ARMOR_SLOTS`), one of `cloth`, `leather`, `chain` and `plate`.
- `weaponType`: for weapon slots, a type from `HELD` in `client/src/character/weapons.js`, including `shield` and `orb` for an off hand. `speed` is its swing time, and `damage` (`[min, max]`) overrides what the server works out.
- `stats`: gear stats, from the list above.
- `colors`: `[main, trim]`, recoloring the shared model for its type and slot.
- `price`: what a vendor sells it for. Vendors buy it back for a quarter of that. Leave it out for an item vendors won't take.
- `stack`: how many fit in one bag slot, 1 by default.
- `use`: an ability it casts when you use it, like food or a potion. `consumed` true uses one up.

### Item templates

The server rolls generated gear from these when a mob drops gear, at the mob's level.

```json
{
  "id": "swrd0001",
  "names": ["Worn Shortsword", "Militia Sword", "Notched Blade"],
  "slot": "oneHand",
  "weaponType": "sword",
  "speed": 2.4,
  "levels": [1, 12],
  "qualities": { "common": 4, "uncommon": 1 },
  "stats": { "primary": 2, "stamina": 2, "secondary": 1 },
  "colors": [["#9a9ea4", "#6b4a2e"], ["#7a7e84", "#3a2a1a"]]
}
```

- `levels`: the mob levels it drops from.
- `qualities`: how likely each quality is, by weight. Better quality means a higher item level.
- `stats`: how the stat budget splits, by weight. `primary` is the primary stat of whoever loots it, and each `secondary` is a secondary rating rolled at random.
- `colors`: `[main, trim]` pairs to pick from.

The rest is as for items.

### Creatures

```json
{
  "id": "wolf0001",
  "name": "Timber Wolf",
  "family": "wolves",
  "creatureType": "beast",
  "look": { "body": "wolf", "scale": [0.9, 1.1], "coloration": ["timber", "grey"] },
  "reaction": "hostile",
  "attack": { "speed": 2 },
  "abilities": ["bite0001"],
  "loot": { "junk": 0.6, "gear": 0.08, "items": [{ "item": "pelt0001", "chance": 0.3 }] }
}
```

- `look`: a character recipe (`client/src/character/recipe.js`). Its `body` is `humanoid`, or one of the creature [bodies](#bodies). A creature body gives the look its own settings (its file's `look`), and the recipe's settings go over them, so a world can make a pale goblin or a small troll. A creature body's look takes a `scale`, its size against the body's (0.5 to 2, 1 by default), and a `coloration`, one of the body's colorations by name; either can be a list or range each spawn picks from. A `height` in feet sets its size outright instead. Goblins and trolls stand on the humanoid skeleton and use its clips; four-legged bodies (wolf, panther, rat, rabbit, squirrel, hyena, lion, tiger, housecat, deshaug, coalhound, chimera, bear, gorilla, owlbear, myoxa, boar, stag, deer, goat, sheep, cow, horse, elephant, mammoth, rhino, hippo, lizard, basilisk, crocodile, hydra, frog, turtle, tortoise) dragons (dragon, wyvern), serpents (snake, cobra, centipede, duneshk, eel, coatl) swimmers (shark, barracuda, piranha, stingray, sea turtle as `seaturtle`), bats, crawlers (spider, scorpion, beetle, crab, ant, hivari, wasp), slimes and wisps, birds (vulture, owl, eagle, crow, chicken, penguin), striders on two legs (raptor, tyrant, ostora) and the eyeshaug have skeletons and clips of their own. An eyeshaug hovers, a great eye on its front and eye stalks on its crown, and burns with its gaze. A bird folds its wings on the ground and flies on them, but a chicken or penguin can't fly; a penguin slides on its belly to attack. A wisp floats and glows, motes of light circling it. A four-legged look can take a `flesh` (deshaug are fire, coalhounds molten, myoxa fungal). The cats (panther, lion, tiger, housecat, and the chimera) slink with their heads low, swipe with a forepaw and pounce. A rabbit or frog hops to walk and run. A hydra has five heads on long necks; a chimera is a lion with a goat's head rising from its back and a snake's head on its tail. A turtle or tortoise hides in its shell when hit, a hyena laughs and a gorilla beats its chest for a battle cry. A wasp hovers, its legs hanging, and flies; a coatl flies on feathered wings; a duneshk rises out of the ground for its battle cry and dives back into it to attack. A swimmer floats off the ground, and its height is its length (a stingray's or sea turtle's, its width); its walk and run are swims. A bat is always in the air, and its height is its wingspan. A creature plays a clip for each role it has: idle, walk, run, fly, attack, bigAttack, cast, shoot, breath (a dragon's or deshaug's fire, from its `mouth` bone), battleCry, hit and death. Bodies not built yet are drawn as humanoids.
- A humanoid look holds a `weapon` and `offhand`, each made in a `weaponStyle` and `offhandStyle` of `fine`, `crude` or `savage`, and wears `armor` with a `style` per piece of `fine`, `tattered` or `savage`. Its attacks go by its weapon: unarmed, one-handed, two-handed, bow, firearm or thrown.
- `loadouts`: a list of outfits, each with any of `weapon`, `offhand`, `weaponStyle`, `offhandStyle`, `armor` and `colors`, and a `weight` (1 by default). Each spawn wears one, picked by weight. An outfit goes over its body's look, and the recipe's own settings go over the outfit. Goblins and trolls come with loadouts, and a world's `loadouts` replace them.
- A recipe also shapes the body with `arms`, `legs` and `head` (0 to 1, 0.5 ordinary: longer arms, longer legs, a bigger head, at the same height), `ears` (`round`, `pointed`, `long` or `bear`), `nose` (`human`, `long` or `broad`), `tusks` (`none`, `small` or `large`), `muzzle` (`none`, `canine`, `reptile`, `bovine`, `frog`, `boar`, `bear`, or `insect` for mandibles and compound eyes), `horns` (`none`, `small`, `bull`, `ram`, `swept`, `antennae` or `antlers`, colored by `colors.horn`), `tail` (`none`, `reptile`, `thin`, `tuft` or `bushy`), `wings` (`none`, `bat` or `feather`), `hands` (`hands`, or `pincers` for a crab's claws), `lowerArms` (`none`, or `pair` for a second pair of arms below the first, which hold nothing), `flesh`, `lower` (`legs`, `hocked` for goat's legs on hocks in the secondary color, or `horse` for a horse's body in the secondary color, `drake` for a drake's body in the skin color, `serpent` for a serpent's tail, `vortex` for a whirl down to a point in the secondary color), `gait` (`normal`, or `shamble` to stand, walk and run as a zombie) and `unarmed` (`punch`, or `claw` to tear with its hands when it holds no weapon). `hair` can also be `cap` (a mushroom's), `branches` (a tree's, with leaves in `colors.leaf`) or `leaves`, and `jewelry` can hold a `crown`, its gem in `colors.paint`.
- `flesh` is `living`, `rotting`, `stitched` (rotting, sewn together), `bone`, an element's (`stone`, `fire`, `water` or `air`), or `fur`, `shell`, `chitin`, `wrapped` (a mummy's linen), `spirit` (pale and see-through), `shadow` (dark and see-through), `bark`, `fungal` or `molten` (dark rock with glowing cracks). Fur, shell, chitin, wrapped, spirit, shadow, bark, fungal and molten wear no clothes, though they wear armor.
- The humanoid creature bodies are made of these: orc, ogre, kobold, gnoll, lizardfolk, tauros, skeleton, zombie, giant, harpy, gargoyle, imp, centaur, naga, amphen, the elementals georite, furite, aquite and aerite (earth, fire, water and air), boric (boar-folk), ursol (bear-folk), trog, homari (lobster-folk), tyrshaug, drakel, abomination, ghoul, mummy, lich, banshee, ghost, deepshaug, smoulder, treant, dryad, succubus, hivelord, cindershaug, golem, mycosi (mushroom-folk) and drakesh (a drakel's upper body on a drake's).
- `creatureType`: `beast`, `humanoid`, `undead`, `elemental`, `demon`, `dragonkin`, `giant`, `mechanical`, `aberration` or `critter`. Some abilities only work on some types. `family` groups creatures in the editor.
- `reach`: how far its body extends from its center (see Distance and areas). Left out, it's its body's [reach](#bodies) at its size.
- `classification`: `normal` by default, or `trivial`, `elite`, `rare`, `rareElite` or `boss`. With the level, it sets health, damage and armor, and `health`, `damage` and `armor` multiply those (1 by default).
- `reaction`: `hostile` attacks you on sight, `neutral` only when attacked.
- `aggroRadius`: how near you get before it notices, 60 ft by default, longer when it outlevels you and shorter when you outlevel it. It's measured in 3D, and it has to see you.
- `stealthed`: it spawns stealthed, and stealths again when it resets, with the `stealth` status this names.
- `attack`: auto-attack `{ speed, range, school }`, by default 2 s, melee, physical.
- `speed`: a multiplier on run speed, 1 by default.
- `resource`: one resource, as a class has, for abilities that cost something.
- `onDeath`: an ability it uses as it dies, from where it fell, with no cost or cast time. Tactics never pick it.
- `abilities` and `tactics`: what it can do and how it picks. `tactics` is one of `{ "type": "random" }` (the default), `{ "type": "priority", "abilities": [...] }` and `{ "type": "rotation", "abilities": [...] }`.
- `loot`: `gold` multiplies the gold it drops for its level (1 by default; 0 drops none). `junk` and `gear` are chances of a junk item and of generated gear. `items` are written items, each with a `chance`.
- `tags`: free-form words for sorting, like `caster` or `healer`. They don't change how it plays.

Every mob picks its target by threat.

### NPCs

```json
{
  "id": "vend0001",
  "name": "Brother Danil",
  "title": "General Supplies",
  "look": { "body": "humanoid", "height": 5.8 },
  "dialogue": "danl0001",
  "vendor": { "sells": ["brd00001", "watr0001"] }
}
```

NPCs can't be attacked. `dialogue` is what they say when you talk to them. `vendor` sells `sells` and buys what you bring.

### Dialogue

```json
{
  "id": "danl0001",
  "start": "hello",
  "lines": {
    "hello": {
      "text": "Welcome, traveller. Bread's fresh today.",
      "choices": [
        { "text": "What's for sale?", "do": "vendor" },
        { "text": "What is this place?", "next": "place" },
        { "text": "Goodbye.", "do": "close" }
      ]
    },
    "place": { "text": "Saint Aldric's Priory. Mind the goblins in the hills.", "choices": [{ "text": "Thanks.", "next": "hello" }] }
  }
}
```

Each line has the NPC's `text` and your `choices`. A choice goes to the line `next` names, or does `vendor` (opens the NPC's shop) or `close`. A line with no choices ends the conversation.

### Spawns

`places/continents/<c>/spawns.json`:

```json
{
  "version": 1,
  "regions": [
    {
      "id": "r8k2m1qa",
      "name": "Wolf Den",
      "area": [[[[10, 12], [14, 12], [14, 15], [10, 15]]]],
      "spawns": [{ "creature": "wolf0001", "density": 6, "pack": [1, 3], "levels": [3, 4], "respawn": 300 }]
    }
  ],
  "placed": [
    { "id": "p1x9z2aa", "npc": "vend0001", "at": [5120, 82, 6400], "yaw": 90 },
    { "id": "p2b7c3dd", "creature": "wolf0002", "at": [5400, 80, 6600], "levels": 6, "respawn": 900, "pack": "den00001" },
    { "id": "p3c8d4ee", "creature": "wolf0002", "at": [5410, 80, 6604], "levels": 6, "respawn": 900, "pack": "den00001" },
    { "id": "p4d9e5ff", "creature": "wolf0001", "at": [5600, 85, 6500], "levels": 5, "patrol": { "points": [[5600, 6500], [5800, 6500], [5800, 6700]], "loop": true } }
  ]
}
```

- `regions`: areas marked on the map, named or not. `area` is a multipolygon in units of 512 ft, which isn't a tile's size now: settle this when spawns are built. Each of its `spawns` scatters `density` mobs per 512 ft square of `creature` across the area at random, at a level from `levels` (a number, or `[min, max]`), each coming back `respawn` seconds after it dies. `pack`, `[min, max]`, spawns them in packs of that many, 1 by default. `wander` is how far each strays from where it spawned, 30 ft by default.
- `placed`: one `creature` or `npc` each, `at` a point in feet, facing `yaw`. Creatures take `levels`, `respawn`, `wander`, `pack` and `patrol`:
  - `pack`: an id that placed creatures share. When one is pulled, the rest join.
  - `patrol`: `points`, each `[x, z]` in feet, that it walks between, on the ground. With `loop` it goes back to the first; without, it turns back. A patrolling creature doesn't wander.

Mobs near one that's pulled, of the same `family`, may join it too.

## The game protocol

The play page talks to the Go game server (`game-server/`) over a websocket. The game server owns every character's state in a world. The browser sends what its player does, and the server tells it what everyone nearby does.

### Entering

1. The play page gets an entry token from Rails, in its config with the game server's address.
2. The client opens `wss://<game server>/play?token=<token>`. A browser websocket can't set headers, so the token goes in the URL.
3. The game server checks the token's signature and expiry, loads the world, and asks Rails for the character.
4. If the world has classes and the character has none of them, the server sends `pickClass` and waits for `pick`. It keeps the choice with Rails. A character asks again only if its class leaves the world.
5. The server places the character and sends `welcome`.

A token lasts 5 minutes. To enter again after that, reload the page.

#### Entry tokens

A token is `<payload>.<signature>`, both base64url without padding. The payload is JSON:

```json
{ "user": 7, "character": 12, "world": 3, "repo": "owner/name", "sha": "<released commit>", "exp": 1798000000 }
```

`exp` is in Unix seconds. The signature is HMAC-SHA256 of the payload's base64url text, keyed with `GAME_TOKEN_SECRET`, which Rails and the game server share.

### Placing a character

- The game server keeps each released commit's zip on disk, keyed by repo and sha, and downloads it from GitHub the first time someone enters it. A world stays in memory while it has players, and unloads a few minutes after the last one leaves.
- Rails gives the character's last position in the world, or none. With none, the character starts at the world's spawn point (`spawn` in `world.json`). A character still connected elsewhere in the same layer keeps where it is there.
- The open world runs as layers (copies). The server puts each entering character on a layer. For now each world has one.

### Messages

Each websocket message is a JSON text frame, `{ "type": ..., ... }`. Positions are continent feet `[x, y, z]` (x east, z south, y up), and `yaw` is radians, 0 facing +z.

#### Client to server

| type | fields | sent |
|---|---|---|
| `pick` | `class` | you choose from `pickClass`. Send `heartbeat`s while you decide; the server ignores all else until `pick` |
| `move` | `t`, `at`, `yaw`, `move` | whenever its movement changes: starting, stopping, turning, jumping, changing gait |
| `heartbeat` | `t`, `at`, `yaw` | twice a second while moving or turning, once a second otherwise |
| `use` | `ability`, `target`, `spot` | you ask to use an ability: `target` is who it's aimed at, 0 for no one, and `spot` is `[x, y, z]` for one aimed at the ground |
| `stop` | none | you stop what you're casting or channelling |

`t` is the client's clock in milliseconds when it sent the message, from a clock that only goes forward (`performance.now()` in a browser). Without it, the server times the message by when it arrived.

`move` is how the character is moving, so others can carry it on between messages:

```json
{ "forward": 1, "strafe": 0, "turn": -1, "gait": "run", "swim": false, "jump": false }
```

`forward` and `strafe` are -1, 0 or 1 (strafe 1 is left), `turn` is -1 (right), 0 or 1 (left), `gait` is `walk`, `run` or `sprint`, and `jump` is true in the message sent as it leaves the ground.

#### Server to client

| type | fields | sent |
|---|---|---|
| `pickClass` | `classes` (ids) | before `welcome`, to a character that has to choose. Each is `classes/<id>.json` in the world |
| `welcome` | `you` (a character), `layer` | once, on entering |
| `snapshot` | `characters` | once, after `welcome`: everyone near you |
| `appear` | `character` | someone comes near you |
| `vanish` | `id` | someone leaves your area, or the game |
| `moved` | `id`, `at`, `yaw`, `move` | someone near you sent `move` or `heartbeat` |
| `correct` | `at`, `yaw` | your last report didn't add up: you're back at `at` |
| `used` | `id`, `class`, `ability`, `target`, `spot`, `gcd` | someone near you started using an ability: clients play its timeline from this |
| `stopped` | `id` | someone's cast or channel ended early |
| `refused` | `ability`, `why` | you can't use that now |
| `cooldown` | `ability`, `seconds` | an ability of yours started its cooldown |
| `hit` | `from`, `ability`, `on`, `effect`, `amount`, `crit`, `resource`, `status`, `class`, `lasts`, `dps`, `health`, `maxHealth` | one of an ability's effects landed on someone near you |
| `health` | `id`, `health`, `maxHealth` | a training dummy reset |
| `statusGone` | `id`, `status` | a status ran out |
| `resources` | `resources` | how much of each resource you have, by key, at most twice a second |
| `error` | `message` | before the server closes the connection |

A character is `{ id, name, look, continent, at, yaw, move, class, dummy, health, maxHealth }`. `look` is the character builder's look. Training dummies come as characters with `dummy: true` and negative ids, in your `snapshot`: all of those on your continent.

"Near you" is the 3×3 tiles around your tile, on your continent and layer.

### Movement checks

The game server checks that each report follows from the last one it took, the way the genre's servers do. It checks speeds and clocks, and where you stand against the continent's plates, placed files and caves.

- **Speed:** how far you went across the ground since the last report, against how fast you were moving: run 21 ft/s, walk 7.5, back up 13.5, swim 14.2, and sprint doubles running. That allows 15% and 4 ft extra for timing. Standing still, you can't move. A report far away is a teleport and fails the same way.
- **Clock:** for the first 5 s, the server measures how far your clock is behind its own. After that, a report whose clock is more than half a second further ahead fails, since a fast clock would give you more time to move in. A clock that goes backward fails too.
- **Rising:** you can climb 1.5 ft for each foot you move across, plus 4 ft, and a jump's height (about 2.7 ft) within 1.5 s of jumping.
- **Falling:** you can drop as fast as gravity (48 ft/s²) takes you since you started down, plus 1.5 ft for each foot across.
- **Ground:** you can't go more than 2 ft under the ground, except on a slab or through a cave's mouth, or move into a slab, a cave's rock, a tree or an object. Off the tiles is sea. Off the ground and not jumping, you have to fall as gravity would, after half a second's grace, so you can't float or walk on water. Walking from ground to ground, you can't climb slopes steeper than 50°, with 25% and 2 ft extra (`MaxClimb` in `game-server/internal/worlds/ground.go`). You can only swim in water deeper than 4.5 ft.
- **Entering:** your first report has to be near where the server put you, allowing for moving at a sprint since then, and is checked against the ground too. The server puts you on the ground at the spawn point, or at swimming depth in deep water.

The server keeps each fall's height and time when you land, for fall damage later.

A report that fails isn't passed on. The server sends `correct`, and the client puts you back there and reports afresh. Reports that arrive before the client has taken the correction are dropped quietly for up to 2 s. More than 10 corrections in a minute drops the connection.

### Combat

The game server decides what abilities do, from the class files in the released commit. It checks `use` against where it has you, so the client reports where you are just before it.

- **Class:** you play the one you picked in this world, and have all its abilities.
- **Checks:** you need a class that has the ability, nothing else being cast, the global cooldown (1.5 s, or the ability's `gcd`) and its cooldown or a charge over, what it costs, to be standing still if it takes time and isn't `castWhileMoving`, a target of the right kind, to be in range (melee reaches 8 ft), and to face an enemy target (the half circle in front of you).
- **Timing:** the same as the client's timeline. A cast lets go after `castTime`, and spends its cost and starts its cooldown then. A melee hit lands 0.3 s after that. What flies lands when it arrives, at `speed`. A channel lands its effects on each of its ticks, evenly over its `duration`. Moving stops a cast or channel.
- **Stats:** at level 1, primary stats are 12 and the others 6, stamina 12, attack power is twice the higher of strength and agility, spell power twice intellect, and health ten times stamina. A weapon swing does 10. A hit has a 5% chance to do double.
- **Resources:** mana holds 1000 and regains 20 a second, energy holds 100 and regains 10, and rage holds 100, starts empty and falls by 1. Points hold `max` and go by `regen`.
- **Enemies:** only training dummies, for now. A dummy has 100000 health, never drops below 1, and heals up and starts its damage tally over after 5 s unhit.
- **Not yet:** an `all` cost spends only its least, and `perSpent`, `maxHealth` and `shareOfTrigger` amounts and `perSpent` durations count for nothing. The `interrupt`, `taunt`, `move`, `dispel`, `consume`, `cooldown` and `resurrect` effects do nothing, `summon`, `command` and `units` do nothing, `consumedBy` does nothing, `when`, `chance` and `perCount` on an ability's effect aren't checked, what a status does while it's on (`effects`), including `immune`, doesn't apply, nothing checks line of sight, and nothing misses, or is dodged, parried or blocked.

### Rails and the game server

They call each other with fixed shared tokens in an `X-Internal-Token` header. Rails accepts the ones in `INTERNAL_API_TOKENS`, and the game server sends `RAILS_INTERNAL_TOKEN`.

- `GET /internal/worlds/:world/characters/:character` gives `{ id, name, look, class, position }`, `class` being the id it picked in that world or null, and `position` being `{ continent, at, yaw }` or null.
- `PUT /internal/worlds/:world/characters/:character/position` with `{ continent, at, yaw }` keeps where the character is in that world (a `WorldCharacter`), and answers 204.
- `PUT /internal/worlds/:world/characters/:character/class` with `{ class }` keeps the class it picked there, and answers 204.

The game server never writes to the database directly.

### Saving positions

The game server keeps positions in memory, and saves one when it has changed:

- when the character leaves the game;
- when it crosses into another plate;
- every 30 s;
- when the server stops, for everyone.

Saves go to Rails in the background, one at a time, keeping only each character's latest position.
