# World file formats

Every file in a version 2 world, plus the game protocol. JSON Schemas are in [docs/schema](../docs/schema). When a format and its code disagree, the code wins: fix this file in the same commit.

A change to a format has to reach every reader of it. The client's is in the code column below. The game server and bots (`game-server/internal/worlds/`) also read `world.json`, plates, placed and caves files, and `water.json`. Regenerate their shared test world with `node game-server/internal/worlds/testdata/world.mjs`. `.agents/skills/measure-world/measure.mjs` decodes plates, platters and caves.

- [A world's files](#a-worlds-files)
- [Plates](#plates) and [platters](#platters)
- [Placed objects and slabs](#placed-objects-and-slabs), [slabs](#slabs), [templates](#templates)
- [Caves](#caves) and [cave layout](#cave-layout)
- [Biomes, planning marks and water](#biomes-planning-marks-and-water)
- [Roads](#roads)
- [Bodies](#bodies)
- [Game data](#game-data)
- [The game protocol](#the-game-protocol)

## A world's files

A world is a directory of files, usually a GitHub repo. Paths are relative to its root. `<c>` is a continent key from `world.json`, and ids are 8 lowercase base-36 characters.

| Path | What it is | Format | Code |
| --- | --- | --- | --- |
| `world.json` | version (2), name, level cap, continents, dungeons, spawn point, training dummies, rest points | [schema](../docs/schema/world.schema.json) | `client/src/create/main.js` |
| `collections.json` | the world's object collections | [schema](../docs/schema/collections.schema.json) | `client/src/objects/collections.js` |
| `template-collections.json` | the world's template collections | [schema](../docs/schema/collections.schema.json) | `client/src/objects/collections.js` |
| `objects/<id>.json` | a built object | [schema](../docs/schema/object.schema.json) | `client/src/world/builtObjects.js` |
| `templates/<id>.json` | slabs and objects placed together | [Templates](#templates), [schema](../docs/schema/template.schema.json) | `client/src/world/templates.js` |
| `textures/<id>.json` | an image objects and slabs wear | [schema](../docs/schema/image.schema.json) | `client/src/objects/collections.js` |
| `icons/<name>.svg` | an icon for abilities, statuses and items, the name lowercase letters, digits and dashes | [Icons](#icons) | `client/src/play/icons.js` |
| `effects/<name>.json`, `effects/<name>.png` | a sheet of textures for effects, the name lowercase letters, digits and dashes | [Effect textures](#effect-textures) | `client/src/abilities/effectTextures.js` |
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
| `places/continents/<c>/roads.json` | footpaths, trails and roads | [below](#roads), [schema](../docs/schema/roads.schema.json) | `client/src/v2/roads.js`, `client/src/create/roads.js`, `client/src/play/loader.js` |
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
r ...
tile <index>
...
```

Each tile the plate has comes in row order, with `index` = `tz * 8 + tx` within the plate, and runs from its `tile` line to the next. A tile leaves out the lines it has none of: `w` with no water, `c` with no cuts, `r` with no roads.

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

How far courses and roads moved the corners down, for putting them back when one moves (`client/src/v2/courses.js`, `roads.js`). A line for each run of cut corners in a row: `c <row> <column> <cuts>`, row and column in 2 digits, then 2 digits a corner: its cut in quarter feet, plus 2,048 (under 2,048 where a course or road built the ground up).

### Road cells

`r <runs>`: which cells are on a road, as the `b` line keeps biomes: a run is 2 digits of its length less one, then a digit of the road's kind, 1 more than its index in `ROAD_KINDS` (`client/src/v2/roads.js`), or 0 for none. /create works it out as it carves roads: a cell's on a road where the road's track passes within half its width of the cell's middle, or 2.5 ft for a narrower road. Nothing fills the slots on a road's cells, in the client, the game server or bots.

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
- `road`, when there is one, is the [road](#roads) that put it there. /create works out every road's things again when the roads or the water change, and takes away those of roads that have gone, so moving one by hand doesn't last.
- `cave`, when there is one, is the cave network it's in: the one whose 32 ft chunk it's in, under the ground there. /create keeps it as things are placed and moved, places or moves things into a network only while it's being polished, and takes them all away if it goes back to layout.
- `footprint` and `height` are what stands in the way, in feet, worked out from its type and scale when it's saved, so the game server needs no object library: `{ "circle": r }`, `{ "capsule": [r, half] }` along its own x, `{ "rect": [w, d] }`, or `{ "open": r }` for one that doesn't block. Files saved before they were kept leave them out, and the server works out a built-in kind's itself.

### Variant sets

A built object's `variantSet` names the set it's in. Objects in one collection with the same name are variants of each other. /create's picker shows a set as one tile, and placing one switches to a random other, so what you place in numbers varies. A placed object records the variant it is as its `type`, so nothing else reads sets.

A built object with `walkThrough: true` doesn't stand in the way: its `footprint` comes out as `{ "open": r }`.

A built object's `sizeVary`, more than 0 and up to 0.5, is how far `/create` varies its size from one placing to the next, as a share either side, so 0.1 is 10% bigger or smaller. It's left out for an object that doesn't vary. It only sets where the size slider starts: each placement keeps the `scale` it got.

### Slabs in a placed file

Each is a [slab](#slabs), with `template` when it was placed from one, and `cave` and `road` as objects have them.

A placed object's `type` can name a kind the world doesn't have, after its object was deleted or its changes dropped. Every reader keeps going: `/create` keeps it in the file through saves and shows it as a pink box you can pick and delete, and the game draws nothing there. It stands in the way only if it has its `footprint` and `height` kept, for the client and server alike.

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
- The 256 ft reach limits how long a flight is.

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

A slab belongs to the plate holding its home corner: the north-most top corner, the west-most of those. Every corner, top and bottom, is within 256 ft of the home corner. So to find the slabs near a point, read the plates that touch a 64 ft square around it.

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

A world keeps its caves in a text file for each plate (8×8 tiles, 2,048 ft square) that has any. Code: `client/src/v2/caves.js`, with a reader in `game-server/internal/worlds/caves.go`.

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

A biome is one of `BIOME_NAMES` in `client/src/v2/biomes.js`. It changes the ground's look, clutter, what stands in object slots and how water looks, and never the ground's shape. Water looks frozen or like lava in some biomes but still acts as water, and there its falls run down the ground. `client/src/v2/fill.json` says what stands in each biome and by its water.

`planning.json` (`client/src/create/marks.js`) holds what a builder draws to plan with. Line `width` is 1 to 4:

```json
{ "version": 1, "lines": [{ "points": [[0, 0], [64, 0]], "color": "red", "width": 2, "style": "solid" }], "pins": [] }
```

`water.json` is `{ "version": 1, "bodies": [...], "courses": [...] }`. A body (`client/src/v2/water.js`) is `{ type, level, points }`, standing at `level` ft over the cells in its outline whose ground is lower. Courses are in `client/src/v2/courses.js`. Both are baked into [plates](#water) as each cell's water. The sea lives only in the plates, at sea level.


## Roads

`roads.json` is `{ "version": 1, "roads": [{ "id", "kind", "points", "seed", "bed" }] }`, drawn with /create's road tool. /create and play read it: play to draw each road's surface. Roads are baked into the plates' heights and [road cells](#road-cells), so the game server and bots walk on them without reading it. Code: `client/src/v2/roads.js`. [Schema](../docs/schema/roads.schema.json).

- `id` is `road` and 4 base-36 characters. What the road puts in the [placed files](#objects) has it as `road`.
- `kind` is `footpath`, `trail` or `road`. Each has a width for new roads, how steeply it climbs at most, how far it leans across, and how deep its banks are cut at most (`KINDS`).
- `points` are `[x, z, width]` in continent feet. The road runs down a track through them, each corner rounded and a little wobble either side, by `seed`.
- `bed` is the road's height under its middle every 8 ft down that track. /create works it out from the ground before courses and roads moved it, when the road's corners, kind or width change.

Each kind is lined the same in every biome (`client/src/v2/roadEdges.js`): roads with edge stones along both sides every 20 ft or so, which you step over, and a milestone every 1,000 ft; trails with a waymark post every 160 ft or so, a side at a time; footpaths with a small cairn every 450 ft or so. None go in the water or on another road. /create puts them in the placed files, so the game server and bots stand them in the way as they do anything placed.

Where a road crosses a course or its pools (`client/src/v2/roadCrossings.js`), it crosses a stream by a ford, with flat stones strewn over it that you walk over, and a river by a plank bridge. The bridge is slabs in a straight line from 4 ft onto one bank to 4 ft onto the other, at most 48 ft each, its ends 0.3 ft over the road's bed and its middle at least 1.5 ft over the water, with a beam down each side. It's as wide as the road, and at least 4 ft. /create puts these in the placed files with `road` too.

Tiles drawn in full draw each road's surface from its middle (`render/groundMaterial.js`): packed earth with prints, paler with wheel ruts on roads, fainter ruts on trails, and a frayed edge on footpaths.

Across, a road is level, and trails and footpaths lean with the ground as far as their kind lets them. Beside it, the ground's cut back in a bank where it's higher and built up in a slope where it's lower, out to 24 ft. Courses carve first, and roads don't change the ground in a course's water or its pools, except to build a stream's bed up to a ford 0.6 ft under its water across the road's width (`fordAt`). Where a road would climb more steeply than its kind's grade, as it does rather than run in a trench through a rise, or cut a bank deeper than its kind's deepest, /create draws that stretch red.
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
- `{ base, attackPower, spellPower, weapon, mastery, byMastery, maxHealth, shareOfTrigger, shareOf, perSpent, minimum, maximum, byMissingHealth }`, any of them, added up: `base` is a number or `[min, max]`, `attackPower` and `spellPower` are coefficients of the caster's power, `weapon` a coefficient of a main-hand weapon swing, `mastery` an amount per point of the caster's mastery percentage, `byMastery` how many percent the whole amount grows per point of that percentage, `maxHealth` a share of the maximum health of whoever it affects, `shareOfTrigger` a share of the hit or heal that set off the trigger or applied the status, and `perSpent` an amount for each point spent (see [Abilities](#abilities), `cost`). On an `overheal` trigger, `shareOfTrigger` is a share of the part past full health. `minimum` and `maximum` are amounts it can't go past. `byMissingHealth` is `{ upTo, of }`: it grows as `of`'s health falls (`self` or `target`, whoever it lands on by default), reaching `upTo` times as much at no health.
- `shareOf` is `{ of, share }`, a share of something the fight has kept track of. `of` is one of:
  - `recentDamage`: damage taken in the last `seconds`, by `on` (`self` by default, or `target`).
  - `stored`: what the status holds (see `store`).
  - `statusLeft`: what's left to do on one of `statuses`, by default the one that set off the trigger.
  - `effect`: what the effect before this one did.
  - `casterMaxHealth`, `unitMaxHealth` (the unit that set off the trigger), `healthSpent`, and `maxResource` of `resource`.

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
  "startingGear": { "weapon": "staff", "offhand": "none" }
}
```

- `primaryStats`: one or more of `strength`, `agility` and `intellect`. A hybrid lists the ones its roles use. Gear rolled for the class uses the first.
- `resources`: one to three. The first is the primary resource. The UI always shows it, and shows the others once you know an ability that spends or gives them. `kind` sets the rules:
  - `mana`: its maximum comes from level, and it regenerates over time.
  - `energy`: 100, regenerating 10 a second, faster with haste.
  - `rage`: 100, built by dealing and taking damage, decaying out of combat.
  - `points`: whole points up to `max`, like ki or combo points. Abilities build and spend them. `regen` adds that many a second (astra's is `1/9`, so about a point every 9 s), and `decay` drains that many a second out of combat.
- `armor`: what it can wear, each with the level it unlocks at. A paladin lists `chain` at 1 and `plate` at 40.
- `weapons` and `offhands`: weapon types from `client/src/character/weapons.js` (`HELD`) that it can use, best first. Until there's gear, the game server gives a character the first ones that suit what its specialization's abilities ask for with `wielding`.
- `startingGear`: `{ weapon, offhand }`, what a character holds when its specialization asks for nothing or it has none yet. `offhand` can be `none`. Either one left out is the first in its list.
- `abilities`: the class's own [abilities](#abilities), written out here, each with the `level` it's granted at. A class's abilities don't generalize to others, so they aren't shared.
- `statuses`: the [statuses](#statuses) its abilities, passives and mastery apply. They point at them by id, unique within the class.
- `units`: what it summons, written out here so a class needs nothing from outside itself. A unit takes `id`, `name` and a creature's `look`, `creatureType`, `reach`, `attack` and `speed`, plus `abilities` from the same class and `autocast`, those it uses on its own when it obeys you. `power` gives it shares of its summoner's `attackPower`, `spellPower`, `health` and `armor`. Its level, crit, haste, mastery and versatility follow its summoner's.
- `specializations`: what a character picks at level 10, which the game sets. Each has `id`, `name`, an optional `status` it holds while it's that, so effects can ask with `when`, and the `abilities` only it gets.
- `talents`: what a character picks from, one per tier, keyed by the tier's level. The game sets the tiers: every 5 levels from 15. A class can leave a tier empty, and otherwise fills it with 3 to 6 talents. A talent has `id`, `name` and `grants`, each a `status` or an `ability`, with `spec` if it's only for that specialization. A talent with no grant for your specialization isn't offered to you. `requires` names a talent in the tier directly above that you have to have picked. Whatever you picked above, you always have at least two to pick from.
- `passives`: statuses it has from their `level`. They never expire, and hidden ones don't show.
- `mastery`: one mastery effect, a status the class always has, whose amounts use `mastery`.

Only a class's `id` and `name` are required for now, so the class editor can save one as it's built. Every class has auto-attack from its weapons. The UI has 3 action bars of 12 slots.

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

- `target`: what you need targeted to use it. `enemy` or `ally`, `any` for either (its effects tell them apart with `targetIs`), or `self`, `ground` (you pick a place within range) or `none`. An `ally` ability with no friendly target lands on you.
- `icon`: its action bar icon, by name from the world's own or the [stock icons](#icons). Without one, the bar shows its name.
- `range`: how far the target can be, a number or `"melee"` (see Distance and areas). `minRange` is how near it can be.
- `requires`: conditions to use it, each `{ health, below or above }` (`health` is `self` or `target`, in percent) or `{ status, on, stacks }` (a status you put `on` `self` or `target`, with at least `stacks` stacks if it says), or `{ targetIs }` (what you're using it on: `enemy`, `ally`, `self`, `other`, `player` or `nonPlayer`), or `{ stealthed }` or `{ inCombat }` (true or false, about you), or `{ anyOf: [conditions] }`, which holds when any of them does, or `{ not: condition }`, which holds when it doesn't, or one of these:
  - `{ state, on }`: `casting`, `inCombat`, `slowed`, `airborne`, `falling`, `controlled`, `stunned` or `outdoors`, for `on` `self` (by default) or `target`.
  - `{ position }`: you're `behind` the target or `inFront` of it.
  - `{ since, below or above }`: seconds since your last `stealth`, `attack` or `kill`, since you last took damage (`damageTaken`), or since you entered combat (`combatStart`).
  - `{ resource, below or above, percent }`: how much of a resource you have, in percent of its maximum with `percent`.
  - `{ holders, atLeast or atMost }`: how many units hold this status from you.
  - `{ unitsOut }`: you have one of these units out.
  - `{ inArea }`: the target stands in the area this ability of yours put down.
  - `{ spentAtLeast }`, `{ targetsHitAtLeast }`: what the ability spent, and how many it hit.
  - `{ outcome }`: the hit just made was a `crit`, or the target `survived` it.
  - `{ targetHealthBelowMine }`: the target has less health than you.
  - `{ wielding }`: you have a `shield`, a `oneHanded` weapon, a `twoHanded` one or `dual` weapons equipped.
  - `{ group, on }`: `on` has a status of this `group`. `{ "not": { "group": "form" } }` holds when you're in no form.

  An execute needs `{ "health": "target", "below": 20 }`.
- `creatureTypes`: the creature types it can target, for an ability that only works on beasts, say.
- `facing`: you must face the target within 90° either side. True by default for `enemy` abilities.
- `castTime`: 0 is instant. Moving or jumping cancels a cast unless `castWhileMoving` is true. `whileCasting` lets you use it while casting something else. `keepsStealth` lets you use it without breaking stealth.
- `replaces`: an ability from the same class that this one takes off your bar when you know it.
- `channel`: `{ duration, ticks, effect }`. You keep casting for `duration` and the effects land on each tick, or just `effect` if it has one, with the ability's `effects` landing once at the start. Moving cancels it too. `costPerTick`, `{ resource, amount }`, is spent on each tick, and it ends when you can't pay.
- `gcd`: 1.5 by default, and haste shortens it to no less than 0.75. `gcd: 0` is off the global cooldown. `gcdHasted: false` keeps it fixed, as energy users' is (1 s).
- `cooldown`, `charges` and `cooldownHasted`: its own cooldown, how many uses it stores, and whether haste shortens it.
- `cost`: what it spends, each `{ resource, amount }`, or `{ resource: "mana", percent }` of base mana. You can't use it without enough. `upTo` spends more if you have it, up to that much in all, and a hit's `byExtraSpent` does up to that many times as much for spending all of it, `perSecond` spends that much each second of a channel, and `when` makes a cost count only while conditions hold. `all: true` spends all you have of it, needing at least that much. An ability can have one such cost, and what it spends is the "points spent" that `perSpent` amounts, `durationPerSpent` and a status's `addPerSpent` and `multiplyPerSpent` count. A finisher costs `{ "resource": "combo", "amount": 1, "all": true }`.
- `speed`: a projectile's speed. Its effects aimed at the target land when it arrives, and fizzle if the target dies first.
- `school`: the school of its damage, unless an effect says otherwise. `schools` instead lists several, or `all` for every school. A hit in several counts as each of them: a bonus to any applies, and immunity has to cover them all.
- `effects`: what it does, below.
- `animation`: what the body does as it uses it, by what it looks like and not by clip, so each body plays its own version. Left out, it goes by the ability: `attack` in melee, `shoot` for a physical one with a ranged weapon, and `cast` otherwise. The client plays the nearest clip a body has: `attack`, `bigAttack`, `shoot`, `cast`, `battleCry`, `breath` or `pray`, and none for `none`. A melee ability with a `castTime` holds a weapon ready through the cast, not a spell.
- `clipSpeed`, `lunge`, `pause`, `shake`: how a swing feels. `clipSpeed` is how fast its clip plays, 1 by default, and a melee hit lands sooner in step. `lunge` is how many feet its user leans in toward the target, which only moves what's drawn. `pause` is how many seconds the user's and target's clips and trails hold still on contact. `shake` is how many feet the user's camera shakes on contact. A melee `attack` and `bigAttack` each have their own defaults for all but `clipSpeed` (`timeline.js`), and 0 turns one off.
  - Melee: `attack`, `offhandAttack`, `dualAttack` (both weapons), `bigAttack`, `spinningAttack`, `stab`, `kick`, `spinningKick`, `punch`, `shieldBash`, `groundSlam`.
  - Ranged: `shoot`, `aimedShot`, `rapidShot`, `throw`.
  - Spells: `cast`, `castBig`, `castChannel`, `castGround`, `castOverhead`, `castSelf`, `castOnAlly`, `pray`.
  - Other: `shout`, `breath`, `roll`, `drink`, `transform`, and `none` for no animation.
- `visuals` and `sounds`: what plays, from the stock sets the core world ships. Each picks an `effect` or `sound`, `when` it plays (`cast`, `launch`, `impact` or `channel`), and `on` (`caster`, `target` or `ground`, the target by default for impacts). Visuals take `colors` and `scale`, and sounds take `volume` and `pitch`, each 1 by default. Abilities can list several visuals to layer them. A visual with `when: "flight"` follows the ability's projectile. A sound takes `volume`, `pitch`, `pitchVariation` (how far off its pitch can land each time, as a share, so 0.1 is up to 10% either way) and `delay` (seconds after its `when`). List several to layer them, such as a whoosh, an impact and a shimmer. Each plays from where it's `on`, quieter with distance. `client/src/abilities/stockSounds.json` lists the stock sounds, each with a few recordings in `public/sounds`, and one's picked at random each time. The game also plays them by itself: footsteps, by the ground's look, and menus, refusals and levelling up. No more than 24 play at once, or 12 on a phone, and the quietest go first, with your own the last to go.

Any visual can set `follow`: true stays on who it's on as they move, and false stays where it started. Particles follow by default and the rest don't, and something `on` the ground stays put. A followed `beam` keeps reaching from its caster to where it's going. A `ribbon` always follows what it trails after.

A `ribbon` is a strip trailing after something moving. With `when: "flight"` it follows the projectile. Otherwise it follows the blade of the weapon in the hand of whoever it's `on`, or their bare hand. It takes `length` (how many seconds a part of it lasts) and `width` (feet, when it isn't off a weapon), and the shape parameters below other than `shape`. A melee swing gets a stock one unless the ability lists a `ribbon` itself.

A `decal` (an ability circle) or `scorch` (a dark burn) is a texture laid over the ground, following its slopes. They take `radius` (feet) and `spin` (turns a second), and the shape parameters below other than `shape`. Ground areas draw with the same thing for as long as they last.

The stock shapes (`bolt`, `burst`, `ring`, `glow`, `swirl`, `beam`, `slash`, `cone`, `shield`, `ribbon`, `decal`, `scorch`) also take `shape` (`sphere`, `cylinder`, `cone`, `ring` or `arc`), `texture` (a repeating one, see [Effect textures](#effect-textures)), `scroll` and `scrollAcross` (repeats a second), `repeat` and `repeatAcross`, `duration` (seconds, or `"cast"`), `fade` (`out`, `pulse`, `hold` or `none`) and `opacity`, laid over what `client/src/abilities/shapeStock.js` gives each.
  - The particle effects are `sparks`, `embers`, `smoke`, `motes`, `flare`, `shards`, `flames` and `shockwave`. `scale` grows their sizes, speeds and reach together. Each also takes any of these over its stock value: `count` to let go at once, `rate` a second for `duration` seconds (or `"cast"` to last until the cast or channel ends, however it ends, with its particles then fading out at once), `lifetime` in seconds, `speed` in feet a second, `direction` (`up` or `forward`) with `spread` in degrees across (360 is every way), `gravity` in feet a second a second (below 0 they rise), `drag`, `size` and `sizeEnd` in feet, `radius` to let them go from round the point, `texture` (`dot`, `spark`, `star`, `smoke`, `ring`, `shard`, `flame` or `noise`), `blend` (`glow` adds light, `solid` covers what's behind), `stretch` along the way they move, `spin` in turns a second, `opacity`, `at` (`feet` or `chest`), and `facing` (`camera`, or `ground` to lie flat). They go from the second of the visual's `colors` to the first. The stock values are in `client/src/abilities/particleStock.js`.
- `tags`: free-form words for sorting, and for a status's `modify` to pick abilities by.

#### Effects

Each effect has a `type` and an `affects`:

- `target`: whoever you targeted, or the place, for `ground`.
- `hit`: whoever this ability's other effects hit.
- `self`.
- `enemies` or `allies`: everyone of that side in an area (see Distance and areas) of `radius` and `height` around `around` (`self`, `target` or `ground`; `self` by default). `cone` narrows it to a slice that many degrees wide in front of you, around yourself only. `max` caps how many it hits, nearest first.

Types:

- `damage`: `amount`, and `school` or `schools` to override the ability's. `drain` heals the caster by that share of what it does, on `damage` and `periodic` alike.
- `heal`: `amount`.
- `resource`: gives `amount` of `resource` (negative takes it).
- `status`: applies `status`, for its own duration unless `duration` says otherwise, and `durationPerSpent` seconds more for each point spent. `amount` sets an `absorb`'s size if it has none, and otherwise what the status holds as `stored`. Amounts in the status's effects count the points this ability spent.
- `interrupt`: stops a cast, and locks its school out for `lockout` seconds.
- `split`, on an effect that hits several: they share the amount, split evenly. `others` gives those besides the main target that share of it, like `{ "others": 0.5 }`. `perTargetHit` as a number gives that share more for each one hit, up to `maxTotal`.
- `extraTargets`: on an ability, or on a status for everything the holder does, its hits also land on up to `max` others within `radius` for `share` of the amount. `hit: "single"` limits it to single-target attacks, `when` and `softCap` work as usual, and `spendsStack` takes a stack each time it spills.
- `alwaysCrit`, on a hit or a `modify`: it always crits. `alwaysCritWhen` does that while conditions hold, `scalesWithCrit` adds your crit chance to what it does, and `critMultiplier` replaces how much its crits do.
- `dispel`: removes up to `count` statuses, 1 by default, of the kinds `dispels` lists, or with one of its `tags`. `dispels` can also list controls, like `root`, and `slow` means every status that lowers movement speed. You can't mark that on a status: a dispel reads it from the status's effects. It takes the oldest first, and only what harms a friend or what helps an enemy.
- `cooldown`: changes the caster's cooldowns on `abilities`, by id from the same class, or on abilities with this `tag`. `by` takes that many seconds off, `reset` makes them ready with every charge, and `charges` gives back that many charges.
- `summon`: brings `unit`, `count` of them, for `lasts` seconds, or until it dies or is dismissed if that's left out. `max` is how many can be out at once. `obeys` means you command it. `statuses` are what it arrives with.
- `command`: your summons, or just `units`, use `ability`.
- `source: "summons"`, on a damage or heal effect: your summons do it, not you.
- `category`, on a damage or heal effect or a periodic: a word the class picks, like `bleed` or `disease`. A `stat` or `trigger` with `category` or `categories` only counts those.
- `area`: a lasting area `around` `self`, `target` or `ground`, `radius` ft across and `lasts` seconds, touching those it `affects`. Those inside have `status` while they stay, and `effect` lands on them each `every` seconds. In that `effect`, `affects: "self"` means whoever's inside. `max` caps how many it touches each time, and `limit` caps how many of these you can have out. `around` can also be `random`, somewhere near you. `onEnter` is an effect that lands once on someone who comes inside. `effects` lists more than one effect for each `every`, in place of `effect`. `overlaps` makes copies of it each work on those inside.
- `extend`: adds `seconds`, or `perSpent` seconds for each point spent, to your copy of `status` or `statuses` on those it `affects`, up to `maxTotal` seconds left or `maxShare` of its full duration. `refresh` starts it over instead, and `apply` puts it on if it isn't there.
- `line`, on an `area` or an effect with `affects: "enemies"` or `"allies"`: it covers a strip `radius` ft long and `width` ft wide instead of a circle. `along` says which way it runs: `facing` (the default), `path` (along the path you just moved) or `ground` (to the ground you picked).
- `flying`, on a `move`: it flies over whatever is in the way.
- `castAbility`: casts `ability` from the same class at those it `affects`, with no cast time. `free` makes it cost nothing, `strength` multiplies what it does and `max` limits how many it goes at. `when` works as usual.
- `threat`: changes how much those it `affects` want to hit you. `clear` wipes it and `multiply` scales it.
- `reveal`: shows stealthed or invisible enemies among those it `affects`, and takes them out of stealth.
- `consume`: takes your copy of `status` or `statuses` off those it `affects`, or just `stacks` stacks of it, or `seconds` of its time. `dealsLeft` does that share of what it had left to do now, and `keeps` leaves it on. `perStack` is an effect that happens for each stack taken. It's for an ability using up a status of its own, where `dispel` removes by kind. With `affects: "summons"` it dismisses or sacrifices summons instead, `units` and `count` saying which and how many.
- `chance`, on any effect, 0 to 1: how likely it is to happen, 1 by default. `chancePerSpent` adds that much for each point spent, here and on a `trigger`.
- `when`, on any effect: conditions written as `requires`. The effect only happens while they hold. An ability checks all its effects' conditions before any of them land, so one button can start a status or end it.
- `prefers`, on an effect with `max`: which it picks first, `nearest` by default, or `injured`, `farthest` or `lowestHealth`.
- `perCount`, on any effect or stat: its number counts once for each of something, up to `max`. Pick `statusStacks` (stacks of that status), `statusesFromMe` (statuses you've put on the target), `statusesOnTarget` (which of those the target has), `unitsOut` (how many of those units you have out) or `resource` (how much of it you have). `add` makes each count add that much, not the whole number again.
- `softCap`, on any effect that hits several: past this many hit, those hit share this many's worth, split evenly.
- `perCount`'s `weights` says how many a status counts as, like `{ "stat0001": 3 }`.
- `perTargetHit`, on any effect: its amount, or a `cooldown` effect's `by`, counts once for each one the ability hits. `maxTotal` is the most it can come to.
- `holding`, with `affects` `enemies` or `allies`: only those holding one of these statuses from you, wherever they are, with no `radius` needed. `around: "holders"` centers an effect on each holder instead.
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

  The server puts them where they end straight away, and their client plays the trip. Without `flying`, a move stops at the foot of anything too steep to walk up, at the side of a slab, and at the edge of the land. It stops other casts. Training dummies stay put.

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

A unit holds one copy of a status for each unit that put it on, so two casters' copies run side by side. When you leave the game, your copies come off everyone.

- `kind`: `buff` or `debuff`, shown on unit frames with its `icon`, or its initials without one, or `hidden`.
- `dispel`: `magic`, `curse`, `poison`, `disease` or `enrage`, or left out if it can't be dispelled.
- `duration`: how long it lasts, unless whatever applies it says otherwise. Leave it out for one that lasts until something removes it.
- `stacking`: what happens when the same caster lands it again. `refresh` resets the duration (and keeps up to 30% of what was left), `replace` starts it over, and `stack` adds a stack up to `maxStacks`, refreshing the duration. Effects scale with stacks. Leaving it out means `replace`.
- `leash`: it ends if the holder goes further than this many ft from whoever applied it.
- `tags`: free-form words a `dispel` can pick it by.
- `breaksOn`: any of `move`, `damage` and `action` (using an ability or attacking). Food and drink break on `move` and `damage`, and stealth on `damage` and `action`.
- `group`: only one status of this group can be on a unit, whoever put it on, and a new one replaces the old. Give a status a group of its own if two casters' copies shouldn't both count. With no `duration` it lasts until replaced. Stances, party auras and shapeshift forms work this way.
- `keptBy`: `abilities` by id from the same class, or `tags`, that don't trigger `breaksOn: ["action"]`. A form keeps its own abilities this way, and anything else you use ends it. A status with `keptBy` stays through auto-attack swings.
- `limit`: how many units can hold it from you at once. Applying it to another takes it off the oldest.
- `consumedBy`: ends it when the holder uses one of these `abilities`, by id from the same class, or an ability with this `tag`. A `modify` on the status still changes that use. `uses` makes it last that many uses, for "your next 3". `stacks` takes that many stacks each use, instead of ending it. The ability doesn't know about it.
- `pose`: `sit` sits you down while it lasts.
- `aura`: a visual on the unit when it gets the status. It takes `effect`, `colors`, `scale` and that effect's parameters, as an ability's visual does. It plays once, unless `duration` is `"status"`, which keeps it going for as long as the status lasts, and shows it to anyone who comes into sight meanwhile. `follow` defaults to true here.

Effects:

Any effect can have `when`, conditions written as an ability's `requires`, checked as the fight goes. It only works while they hold.

- `stat`: changes `stat` by `add` or `multiply`, and `addPerSpent` or `multiplyPerSpent` more for each point spent by the ability that applied it. `school` or `schools` limits a damage or healing stat to those schools, and `abilities`, `tag`, `statuses` and `hit` narrow it the way they narrow a `trigger`. With `statuses` it changes the damage or healing those statuses do. `casterOnly`, on a status you put on someone, limits it to what passes between its holder and the one who applied it, so `damageTaken` counts only what that caster does to the holder, and `damageDone` only what the holder does to that caster. Stats:
  - from gear: `strength`, `agility`, `intellect`, `stamina`, `armor`, `critRating`, `hasteRating`, `masteryRating`, `versatilityRating`, `leechRating`, `avoidanceRating` and `speedRating`;
  - worked out from those: `attackPower`, `spellPower`, `maxHealth`, `resourceMax`, `resourceRegen` (each second), `resourceRest` (where it drifts to out of combat), `resourceDecay` (how fast it falls each second out of combat) and `resourceGain` (a share of what abilities give, starting at 1), which each say which `resource`, `critChance`, `critDamage`, `critHealing`, `critTaken`, `haste`, `mastery`, `versatility`, `leech`, `avoidance`, `dodge`, `parry`, `block`, `movementSpeed`, `attackSpeed`, `stealth` and `detection` (in levels), where percentages add in points;
  - outcomes: `damageDone`, `healingDone`, `damageTaken`, `healingTaken` and `threat`, which multiply.

  `critChance` starts at 5, `critDamage` and `critHealing` at 100, so a crit does 200%, and `movementSpeed` and `attackSpeed` at 100. `critTaken` adds to the chance of those hitting the holder. `leech` heals you by that percent of the damage you do. `stamina` gives 10 `maxHealth` a point, and a change to `maxHealth` keeps the share of health you have. When `resourceMax` drops below what you have, you fall to it, and when it rises you keep what you have. A stat's `add`s go before its `multiply`s, and stacks scale them. A stat narrowed to some hits changes only those: `maxHealth`, `movementSpeed`, `attackSpeed` and the resource stats don't count one that's narrowed.
- `periodic`: every `every` seconds (shorter with the caster's haste), does `damage`, `heal` or `resource` by `amount`. With `affects` and `radius` it hits an area, and `softCap` works as for ability effects. `school`, `schools` and `resource` as for ability effects.
- `absorb`: soaks up `amount` of damage, of `schools` if it lists them, then ends.
- `control`: one of `stun`, `root`, `silence`, `incapacitate`, `disorient`, `fear` and `disarm`. Damage breaks incapacitate, disorient and fear. `root` holds you still, and `stun`, `incapacitate`, `disorient` and `fear` also stop everything you can do. `silence` stops everything but physical abilities, and `disarm` stops auto-attacks and physical abilities in melee. They stop casts they'd have refused.
- `trigger`: when `on` happens, with `chance` (0 to 1, 1 by default), at most once each `cooldown` seconds, applies `effect`, an ability effect that `affects` `self` or `target`. `on` is one of:
  - The holder's hits: `dealDamage`, `takeDamage`, `heal`, `healed` (something heals it), `overheal`, `crit`, `nonCrit`, `dodge`, `parry`, `block`.
  - The holder's actions: `cast`, `channelEnd`, `spend` (it spends a resource), `kill`, `interrupt`, `dispel` (it removes a status), `pickup`.
  - Health: `healthBelow` or `allyHealthBelow`, when the holder or an ally drops below `threshold` percent, and `wouldDie`, when a hit would kill the holder.
  - A status's life: `statusGained`, `statusConsumed`, `statusEnds`, `dispelled` and `holderDies`. Name the statuses in `statuses`, or leave it out to mean this status.
  `of: "caster"` watches the events of whoever applied the status, not the holder, so a mark on an ally can act on your heals: `{ "type": "trigger", "of": "caster", "on": "heal", "hit": "direct", "notOnHolder": true, "effect": { "type": "heal", "affects": "holder", "amount": { "shareOfTrigger": 0.1 } } }`. In a trigger's `effect`, `affects` can be `holder` or `caster`.

  `atMax`, with `on: "statusGained"`, fires when the status reaches its `maxStacks`, and `resets` takes the stacks off when it does. `{ "type": "trigger", "on": "statusGained", "atMax": true, "resets": true, "effect": { ... } }` on a stacking status does something at full stacks and starts over.

  `spendsStack` takes a stack of this status each time it fires.

  `every` makes it fire only on every this-many-th time, like `{ "on": "cast", "abilities": ["bolt0001"], "every": 4 }`. On `spend` it counts points, so `every: 20` with `resource` means each 20 spent. `resetOn` is another event that starts the count over, so `{ "on": "crit", "every": 2, "resetOn": "nonCrit" }` is two crits in a row.

  It can be narrowed, and each filter it has must match. `abilities` or `tag` limits it to those abilities, `statuses` to those statuses, by id from the same class, and `school` or `schools` to those schools. `hit` limits it to a kind of hit: `auto` (a weapon swing), `ability` (not a swing), `melee`, `direct` (not periodic), `periodic`, `area`, `main` (the ability's target), `others` (not its target) or `single` (the only one hit). `atTargets` needs the ability to hit at least that many. `source` says whose stat or hit it is: `self` by default, `summons`, or `both`, and `units` narrows it to those. `casterOnly`, on a status you put on someone, limits it to what the one who applied it does. `atStacks` needs at least that many stacks of the status, for `statusGained` and `statusConsumed`. `full` needs a channel to run its whole length. `pickup` limits it to a kind of pickup, and `resource` to spending that resource, by key.
- `stealth`: hides the holder. Others see it only when they detect it, which depends on how near it is, whether they face it, and the gap between its level plus its `stealth` stat and their level plus their `detection` stat. Undetected, it can't be targeted, but areas still hit it. Entering combat, or being hit, ends the status. Stealth's slower movement is a `movementSpeed` stat effect beside it.
- `modify`: changes abilities the holder uses while it's on, as `stat` changes a stat. The ability itself doesn't know about it. `abilities` picks them by id, from the same class, and `tag` picks all with that tag. Then either:
  - `spentAs` makes the abilities count as spending this much, whatever they spent, or `max` for the most they can. `spendsUpTo` lets them spend this much more of their cost, and `byExtraSpent` works as on a hit.
  - `change` can also be `resourceGain`, for what the abilities give back, or `byExtraSpent`.
  - `becomes` turns the abilities into this one while the modify applies, and `when` limits that.
  - `change` says what changes, by `add`, `multiply` or `set` (`set` goes first, then `add`, then `multiply`). `cost` covers each thing it spends, or with `resource` just that one, and `set` with a `resource` adds that cost if it had none, `cooldown`, `castTime` and `charges` are its own, `amount` and `absorb` are its effects' amounts, `others` is a share for those besides the main target, `every` is a trigger's count, `lockout`, `cone`, `distance` and `delay` are the numbers on its effects with those names, `limit` is how many it can have out or hit, `uses` is a status's `consumedBy` uses, `stacks` is how many stacks it takes, `cooldownRate` is how fast its cooldown runs while the status lasts, `tickRate` is how fast its periodic or channel ticks, `channelDuration` and `channelTicks` are its channel's, `range` and `radius` are in feet, `maxTargets` is the `max` of its area effects, `duration` is how long the statuses it applies last, `damage` and `healing` are what its effects do, and `critChance` and `critDamage` add in points. One `modify` makes one change, so two changes are two effects, like `{ "type": "modify", "abilities": ["frst0001"], "change": "cooldown", "add": -2 }`.
  - `addEffects` lists more ability effects for them to do.
  - `addAmount`, with `change`, adds an [amount](#amounts) worked out in the fight, where `add` takes a number. `byMissingHealth`, with `change`, grows it as health falls.
  - `perTargetHit`, with `change`, gives that share more for each one the ability hits, up to `maxTotal`. For `cost` it's that much more.
  - `addTags` gives them more tags, like letting an ability keep a form.
- `modify` of `statuses`: changes statuses, by id, from the same class, instead of abilities. `change` is `duration` or `maxStacks`, by `add`, `multiply` or `set`, or `statusEffects` lists more effects for them to have, like `{ "type": "modify", "statuses": ["chil0001"], "change": "duration", "add": 2 }`.
- `immune`: the holder is immune to `controls` (`stun`, `root`, `silence`, `incapacitate`, `disorient`, `fear`, `disarm`, `slow`, `interrupt`, `knockback`, `pull`, `pushback`, `charm`, `sleep`), to damage from `schools`, to everything with `all`, or to harmful statuses with `harmful`.
- `overrides`, on a `modify`: replaces those keys of the status's or ability's definition, for things that aren't numbers, like `{ "type": "modify", "statuses": ["life0001"], "overrides": { "stacking": "stack", "maxStacks": 3, "dispel": null } }`. `null` removes a key. With several, the last one a holder has wins. Numbers should use `change`, which adds up.
- `chance`, on a `modify`: it only applies to that share of uses.
- `ignores`, on a `modify` of abilities: `cooldown`, `requires` or both, which they can be used through. `{ "type": "modify", "abilities": ["exec0001"], "ignores": ["requires"] }` lets an execute hit at any health.
- `aura`: an area that follows the holder while the status lasts, with `radius`, `affects`, `every`, `effect`, `status` and `max` as in an ability's `area`.
- `param` on an effect names its number, so a `modify` can change just that number: `{ "type": "stat", "stat": "damageTaken", "multiply": 0.8, "param": "reduction" }` on a status, and `{ "type": "modify", "statuses": ["bark0001"], "change": "reduction", "add": -0.1 }` on a talent. Ability effects can have one too, for a `modify` of `abilities`. The number is a stat's `add` or `multiply`, or its `share` with `fromStat`, the `amount` of a periodic, absorb, damage or heal effect, a `cooldown` effect's `by`, a `share` or `count`, or a trigger's `chance`. A trigger's `effect` can have its own. An `amount` that's an object takes `multiply` and `set`, not `add`. Several talents changing one `param` all count, in the `set`, `add`, `multiply` order.
- `fromStat`, on a `stat` or a `modify` with `change`: it comes to `share` of this stat, like `{ "type": "stat", "stat": "armor", "fromStat": "agility", "share": 0.5 }`. `ofCaster` reads whoever applied the status instead of the holder, as their class and level give it. `primary` means the holder's main stat.
- `mastery` scales with the holder's mastery percentage. `{ "type": "stat", "stat": "damageDone", "mastery": 1, "school": "frost" }` means 1% more frost damage per point. On a percentage stat like `block` it adds the points. On a `modify` it grows what `change` picks, like `{ "type": "modify", "tag": "finisher", "change": "damage", "mastery": 1 }`, and on a `trigger` it adds to `chance`. A `modify` can change `mastery` itself, to give an ability's or status's numbers more from it.
- `store`: keeps `share` of what `from` (`caster` by default, or `holder`) does while the status lasts, for `stored` amounts. `on` is `dealDamage` or `heal`, narrowed with `school`, `abilities` or `statuses` like a trigger. Something ending the status can spend it, like a blast `{ "shareOf": { "of": "stored", "share": 1 } }`.
- `gear`: `allows` lists more equipment the holder can use.
- `swing`: changes how the holder's auto-attacks look. `visuals` plays with each swing, as an ability's `visuals` do, and a `ribbon` among them replaces the stock trail. `clipSpeed`, `lunge`, `pause` and `shake` work as they do on an ability. With several of these on, the visuals all play and the largest of each number counts. It only changes the look, so a `clipSpeed` doesn't change how often the holder swings.
- `untargetable`: nothing can pick the holder as a target, from `afterSeconds` in, or only while under `onlyBelow` percent health.
- `redirectThreat`: the threat the holder makes goes `to` the `target` or `caster`, for `seconds`.
- `countsAsStealthed`: abilities and conditions treat the holder as stealthed. `stealthLinger` keeps that up for `seconds` after stealth ends, and `stealthProtected` stops damage breaking stealth for `seconds`.
- `transform`: shows the holder with the look of the unit `into`, by id from the same class, while the status lasts.
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

- `icon`: its bag and tooltip icon, from the world's own or the [stock icons](#icons). `description` is flavor text on the tooltip.
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

### Icons

Abilities, statuses and items pick an `icon` by name, from the world's own or the stock ones.

A world's own are SVG files at `icons/<name>.svg`, on a 512 by 512 `viewBox`. The client only uses a file's shape as a mask, and draws it in the text color of what it's on, so its colors don't count. A world's icon wins over a stock one of the same name. The client reads them when it opens the world, so keep them small.

The game ships the stock ones in `public/icons/`, listed in `client/src/play/icons.json`. They come from game-icons.net under CC BY 3.0, and `public/icons/credits.txt` credits each one, so add a line there when you add one. The play menu links to it.

### Effect textures

Effects pick grayscale textures by name and tint them, so one texture serves every color. `texture` on a particle visual takes one of these names.

The game ships the stock ones on one sheet, `public/effects/stock.png`, with the names of its cells in `client/src/abilities/stockTextures.json`. `script/bake_effect_textures.py` makes both. Most come from Kenney's Particle Pack, under CC0, as `ATTRIBUTIONS.md` says.

A world adds its own for textures only it needs, with a pair of files for each sheet:

- `effects/<name>.png`: a grid of equal cells, where brighter is more solid. Only its red channel is read.
- `effects/<name>.json`: `{ "columns": 4, "rows": 2, "textures": ["my-flame", "my-rune"] }`, the names of the cells, left to right and top to bottom ([schema](../docs/schema/effect-sheet.schema.json)).

The stock shapes scroll repeating textures across themselves. The game ships those as `public/effects/<name>.png`, listed under `repeating` in that same JSON. A world adds one with `effects/<name>.png` alone, with no JSON beside it, and its edges have to meet so it repeats cleanly.

A world's texture wins over a stock one of the same name. A name that's neither draws as `dot` on a particle, and as `plain` on a shape. Each sheet in use takes a draw call. A particle's up is the image's up, and a stretched one stretches along the image's x.

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
- Rails gives the character's last position in the world, or none. With none, the character starts at the world's spawn point (`spawn` in `world.json`). A character still connected elsewhere in the same layer, or still lingering there, keeps where it is there, and its health, resources, cooldowns and statuses.
- **Logging off:** you can't start in combat. It takes 20 s, and moving, using an ability or getting into combat calls it off. Then the server says `loggedOff` and closes the connection, and the character leaves at once.
- **Resting:** inside a rest point's `area` (in `world.json`), logging off and exiting are both at once, and the character doesn't linger.
- **Lingering:** when a connection ends any other way, the character stays in the world for 20 s, standing still. It can be hit, and its statuses run on.
- **Coming back:** for 10 minutes after a character leaves, the server keeps its health, resources, cooldowns and lockouts, and the statuses it put on itself, and gives them back if it enters the same release of the world with the same class and level. Its statuses stand still while it's gone, and its cooldowns and lockouts keep running.
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
| `bars` | `bars` | you've set your action bars: up to 3 lists of up to 12 ability ids, `""` for an empty slot |
| `build` | `specialization`, `talents` | you ask for this specialization and these talents, out of combat: the server keeps what's allowed and answers with `build` |
| `stop` | none | you stop what you're casting or channelling |
| `logOff` | none | you ask to log off |
| `makeHome` | `rest` | you ask to make this rest point your home. You have to be within 20 ft of it, across the ground |
| `attack` | `target` | you start auto-attacking `target`, or stop with 0 |
| `sees` | `target` | you ask whether the server has you seeing `target`, within 200 ft, up to 40 times a second, for the line of sight overlay |
| `command` | `line` | you typed a line starting with `/`. The server answers with `log` |

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
| `appear` | `character` | someone comes near you. A character carries the `statuses` it holds then, each with `status`, `from`, `class`, `stacks` and `lasts` |
| `vanish` | `id` | someone leaves your area, or the game |
| `moved` | `id`, `at`, `yaw`, `move` | someone near you sent `move` or `heartbeat` |
| `statusOn` | `id`, `status`, `from`, `class`, `stacks`, `lasts` | a status went on someone near you, or a dummy |
| `forced` | `id`, `kind`, `from`, `at`, `yaw`, `seconds`, `height` | an effect moved you or someone near you. It's at `at` already, and clients play the trip over `seconds`, arcing `height` ft up. The server ignores your reports until then |
| `correct` | `at`, `yaw` | your last report didn't add up: you're back at `at` |
| `used` | `id`, `class`, `ability`, `target`, `spot`, `gcd`, `castTime`, `channel`, `cost`, `school`, `schools`, `animation` | someone near you started using an ability, with those numbers as `modify` left them: clients play its timeline from this |
| `swung` | `id`, `target` | someone near you started an auto-attack swing |
| `attacking` | `target` | who you're auto-attacking now, 0 for no one |
| `stopped` | `id` | someone's cast or channel ended early |
| `refused` | `ability`, `why` | you can't use that now |
| `sees` | `target`, `clear` | whether the server has you seeing a unit, for what you asked with `sees` |
| `cooldown` | `ability`, `seconds` | an ability of yours can't be used for this long, 0 once it can |
| `lockout` | `school`, `seconds` | an interrupt locked you out of this school |
| `hit` | `from`, `ability` (none for an auto-attack or a tick), `on`, `effect`, `amount`, `crit`, `missed`, `avoided` (`dodge` or `parry`), `blocked`, `resource`, `status`, `ticked`, `class`, `lasts`, `stacks`, `dps`, `health`, `maxHealth` | one of an ability's effects landed on someone near you |
| `health` | `id`, `health`, `maxHealth` | a training dummy reset |
| `restPoints` | `restPoints`, `home` | as you enter, if the world has rest points: those on your continent as `{ id, name, at }`, `at` standing on the ground, and your home's id or `""` |
| `home` | `home` | you made this rest point your home |
| `loggingOff` | `seconds` | you'll be logged off in this long |
| `logOffStopped` | `why` | logging off was called off |
| `loggedOff` | none | you're logged off, and the server closes the connection |
| `level` | `id`, `level` | someone's level changed |
| `bars` | `bars` | the action bars you set, as you enter, if you ever have |
| `build` | `specialization`, `talents` | what you've chosen, after you enter and whenever it changes |
| `area` | `id`, `from`, `ability`, `affects`, `at`, `radius`, `line`, `width`, `dir`, `lasts`, `follows` | an area went down on your continent. `dir` is the way a line runs, and `follows` is who it moves with |
| `areaGone` | `id` | an area ended |
| `absorb` | `id`, `absorb` | what someone near you can still soak up changed. A character carries `absorb` too |
| `look` | `id`, `look` | someone near you started or stopped looking like something else. Without a `look`, they went back to their own |
| `gear` | `id`, `look` | what someone near you holds changed, and `look` is their own look with it |
| `targetable` | `id`, `targetable` | someone near you became targetable or stopped being. A character carries `untargetable` while it can't be |
| `controls` | `controls` | what's holding you now, a list of `control` words |
| `speed` | `movementSpeed` | how fast you go now, 100 being plain |
| `statusChanged` | `id`, `status`, `from`, `stacks`, `lasts` | the copy of a status that `from` put on `id` has different stacks or time left now. `lasts` is seconds left, or 0 if it stays until removed |
| `statusGone` | `id`, `status`, `from` | the copy of a status that `from` put on `id` ran out or something took it off |
| `resources` | `resources`, `max` | how much of each resource you have and can hold, by key, at most twice a second |
| `log` | `kind` (`system`, `error` or `debug`), `text` | a line for your log |
| `teleport` | `continent`, `at`, `yaw` | the server moved you there. On another continent, the client loads it |
| `error` | `message` | before the server closes the connection |

A character is `{ id, name, look, continent, at, yaw, move, class, level, dummy, health, maxHealth }`. `look` is the character builder's look. Training dummies come as characters with `dummy: true` and negative ids, in your `snapshot`: all of those on your continent. The client draws a dummy as a still post-and-sack dummy (`client/src/world/dummy.js`), whatever its `look`.

"Near you" is the 3×3 tiles around your tile, on your continent and layer.

### Commands

You type commands in the log's box, starting with `/`. The game server reads each one, so the client can't give itself anything.

- `/help`: lists the commands you can use.
- `/spar [on or off]`: training dummies in reach swing back at you every 2 s for 5% of your health, so you can try blocks, parries and what they set off. They leave you at least 1 health.
- `/combatdebug [on or off]`: logs what your abilities do as you use them: what they spend and what goes into each effect, and which effects do nothing yet. It lasts until you leave. Your owner needs the `system_admin` role.
- `/level <1 to 100>`: sets your level in this world, healed up, and keeps it. Your owner needs the `system_admin` role.
- `/weapon <main hand> [off hand]`: changes what you hold until you leave, for everyone to see, in place of what your class gives you. It doesn't change what your abilities' `wielding` checks. Your owner needs the `system_admin` role.
- `/teleport <x> <z> [continent]`, `/teleport spawn` or `/teleport home`: moves you to that spot, to the spawn point, or to your home rest point (the spawn point without one), standing on the ground, ending what you're casting. Your owner needs the `system_admin` role.

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

- **Class:** you play the one you picked in this world, at your level there, which starts at 1. You know its abilities up to your level, leaving out what a specialization or talent gives until you choose it. You choose a specialization from level 10 and a talent in each tier you've reached, from the play menu, and you can change them out of combat. Your bars show what you know until you set them, and then they change only when you change them. Choosing another specialization drops talents that don't suit it. `client/src/play/build.js` and `combat/build.go` hold the rules, and `testdata/build.json` checks both.
- **Line of sight:** Abilities on a unit or a spot, swings, and casts as they finish need you to see what they're on, and areas only take in who can be seen from their center. Sight runs from 5 ft over your feet to 3.5 ft over theirs. The ground blocks it unless a cave's air is there, except within 2 ft of either end. So do tree trunks, a rough egg for each tree's crown, slabs, and objects as an upright footprint their height tall, unless they're `blocksSight: false`. Clutter doesn't, and neither does what either end is in. `game-server/internal/worlds/sight.go` and `client/src/play/sight.js` keep the same rules and share `testdata/sight.json`. The graphics option "show line of sight" draws a line to each character within 150 ft: green when you can see them, yellow when you can't, red when the client and server disagree.
- **Auto-attack:** `attack` starts it, and so does using a melee ability on an enemy. Every 2 s you swing for a weapon's damage, landing 0.3 s later, if the target's in melee range and in front of you and you aren't casting. It stops when you ask or teleport.
- **Checks:** you need a class that has the ability, nothing else being cast, the global cooldown (1.5 s, or the ability's `gcd`) and its cooldown or a charge over, what it costs, to be standing still if it takes time and isn't `castWhileMoving`, a target of the right kind, to be in range (melee reaches 15 ft), to face an enemy target (the half circle in front of you), and its `requires` to hold.
- **Conditions:** the server checks `requires` before you use an ability, and an effect's `when` as it lands. It reads all of an ability's conditions that land together before any of them do. On an effect reaching `enemies` or `allies`, `target` means each one it reaches. You're in combat for 5 s after you last attacked or were hit. The client greys out an ability whose `requires` it knows don't hold.
- **Timing:** the same as the client's timeline. A cast lets go after `castTime`, and spends its cost and starts its cooldown then. A melee hit lands 0.3 s after that. What flies lands when it arrives, at `speed`. A channel lands its effects on each of its ticks, evenly over its `duration`. Moving stops a cast or channel.
- **Stats:** at level 1, primary stats are 12 and the others 6, stamina 12, attack power is twice the higher of strength and agility, spell power twice intellect, and health ten times stamina. A weapon swing does 10. A hit has a 5% chance to do double.
- **Resources:** mana holds 1000 and regains 20 a second, energy holds 100 and regains 10, and rage holds 100, starts empty and falls by 1 out of combat. Points hold `max`, start empty, go up by `regen` and fall by `decay` out of combat. Out of combat a resource moves toward its `resourceRest`, 0 unless a stat raises it, by its decay a second, or 1 a second if it has a rest and no decay. Regen still runs. Players see only whole points, so a part-earned point doesn't show.
- **Passives and mastery:** you hold a class's `passives` from their `level` and its `mastery` status from level 1, for as long as you play. Your `mastery` stat starts at 0, and only a status raises it until gear exists. The client doesn't list them yet.
- **Modify:** the server works out an ability when you start using it, from what you hold then, and it stays that way until it lands. `overrides` go first, in the order you gained the statuses, then `addEffects`, then numbers, so they cover what's added. A status's duration, `maxStacks` and `param` numbers go by what the one applying it holds as it's applied. An ability's cost and cooldown can't go below 0.
- **Periodic:** ticks come from the one who applied the status, every `every` seconds from when it first went on, and putting it on again doesn't start them over. A tick due as the status ends still lands. Ticks can crit but don't miss, and stacks multiply them. `tickRate` from a `modify` is how many times as fast they run. A `hit` from a tick has `ticked`, the status's id, and no `ability`. `slowed` is true while your `movementSpeed` is under 100.
- **Triggers:** whoever applied the status does what a trigger does, except that a `resource` goes to the player it lands on. `self` in a trigger's `effect` means the holder. At most 4 triggers set each other off in a row. `healthBelow` fires as you fall past `threshold`, not while you stay under it. `every`, `cooldown` and what they've counted carry on when a status goes on again.
- **Attack table:** one roll says how an attack comes out: 5% it misses, then for melee your `dodge`, then from in front your `parry`, and spells and ranged attacks only miss. You start with 3 `dodge` and 3 `parry`, and `block` comes from statuses. A melee hit from in front then rolls against `block`, which takes 30% off. Periodic effects can't be avoided.
- **What stats do:** ratings feed `critChance`, `haste`, `mastery`, `versatility`, `leech`, `avoidance` and `movementSpeed`, at 1 point for each 1 + half your level of rating. `haste` shortens casts, channels, swings, ticks and the GCD (never under 0.75 s) and speeds up energy. `versatility` adds to what you do and takes half as much off what you take. `avoidance` takes off damage from areas. `armor` takes `armor / (armor + 400 + 85 x attacker's level)` off physical damage, at most 85%. With no gear yet, only statuses give ratings and armor.
- **Built in:** every class has the Homeward ability and the Resting status (`client/src/abilities/builtins.json`, the same as `game-server/internal/combat/builtins.json`), in place of any of its own with the ids `homeward` and `resting`. Homeward has a 20 minute cooldown, and its 10 s cast takes you to your home rest point, or the spawn point if you have none or the world no longer has it. The server puts Resting on you while you're in a rest point's area, and takes it off when you leave it.
- **Enemies:** only training dummies, for now. A dummy has 100000 health, never drops below 1, and heals up and starts its damage tally over after 5 s unhit.
- **Not yet:** The `taunt` and `resurrect` effects do nothing, `consume` of `summons` does nothing, `summon`, `command` and `units` do nothing, `threat`, `reveal`, `keepsStealth`, `redirectThreat`, `countsAsStealthed`, `stealthLinger` and `stealthProtected` do nothing, `gear` does nothing, the `wielding` condition always holds, `around: "holders"` and a stat's `of` do nothing, `creatureTypes` counts for nothing, a number for `perTargetHit` counts for nothing, `healthSpent` comes to nothing, the `addTags` effect does nothing, `perCount` on a stat isn't checked, and `unitsOut` counts nothing, the `stealthed` and `unitsOut` conditions always hold, `outdoors` always is, `fear` and `disorient` hold you still where they should move you, what a status does while it's on (`effects`) doesn't apply apart from `stat`, `modify`, `periodic`, `trigger`, `control`, `immune`, `untargetable`, `aura`, `absorb`, `store`, `extraTargets` and `transform`, and `along: "path"` runs a line the way you face, the `kill`, `holderDies`, `wouldDie` and `pickup` events of a trigger never happen, `channelEnd` only happens when a channel runs its whole length, a trigger's `units` and `source: both` count only your own, a `periodic` that `does` anything but `damage`, `heal` or `resource` does nothing, a `modify` with `byMissingHealth` does nothing, `overrides` only reach the keys the game reads, and one whose `change` is `lockout`, `distance`, `delay`, `limit`, `uses`, `stacks`, `cooldownRate`, `others`, `every` or `byExtraSpent` does nothing, `atTargets` and `perTargetHit` on a `modify` only work on `amount`, `damage` and `healing`, a `stat`'s `atTargets` and `units` do nothing, `threat`, `stealth` and `detection` are kept but count for nothing.

### Rails and the game server

They call each other with fixed shared tokens in an `X-Internal-Token` header. Rails accepts the ones in `INTERNAL_API_TOKENS`, and the game server sends `RAILS_INTERNAL_TOKEN`.

- `GET /internal/worlds/:world/characters/:character` gives `{ id, name, look, class, level, specialization, talents, bars, position, home }`, `bars` being its action bars or null, `class` being the id it picked in that world or null, `talents` being the talent id picked for each tier's level, `position` being `{ continent, at, yaw }` or null, and `home` being its home rest point's id or null.
- `PUT /internal/worlds/:world/characters/:character/position` with `{ continent, at, yaw }` keeps where the character is in that world (a `WorldCharacter`), and answers 204.
- `PUT /internal/worlds/:world/characters/:character/home` with `{ home }` keeps its home rest point there, and answers 204.
- `PUT /internal/worlds/:world/characters/:character/level` with `{ level }` keeps its level there, and answers 204.
- `PUT /internal/worlds/:world/characters/:character/bars` with `{ bars }` keeps its action bars there, and answers 204.
- `PUT /internal/worlds/:world/characters/:character/build` with `{ specialization, talents }` keeps what it chose there, and answers 204.
- `PUT /internal/worlds/:world/characters/:character/class` with `{ class }` keeps the class it picked there, and answers 204.

The game server never writes to the database directly.

### Saving positions

The game server keeps positions in memory, and saves one when it has changed:

- when the character leaves the game;
- when it crosses into another plate;
- every 30 s;
- when the server stops, for everyone.

Saves go to Rails in the background, one at a time, keeping only each character's latest position.
