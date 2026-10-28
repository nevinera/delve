# A world's files

A world is a directory of files, usually a GitHub repo. Paths are relative to its root. `client/src/world/paths.js` builds and parses every one of them, so use it rather than writing paths by hand.

| Path | What it is | Format |
| --- | --- | --- |
| `world.json` | name, continents and dungeons | [schema](../schema/world.schema.json) |
| `collections.json` | the world's object collections | [schema](../schema/collections.schema.json) |
| `structure-collections.json` | the world's structure collections | [schema](../schema/collections.schema.json) |
| `objects/<id>.json` | a built object | [schema](../schema/object.schema.json) |
| `structures/<id>.json` | a structure | [schema](../schema/structure.schema.json) |
| `textures/<id>.json` | an image objects and structures wear | [schema](../schema/image.schema.json) |
| `places/continents/<c>/sketch.json` | pins, road paths, rivers and lakes | [schema](../schema/sketch.schema.json) |
| `places/continents/<c>/zones/<key>.json` | a zone: a name and a region | [schema](../schema/zone.schema.json) |
| `places/continents/<c>/edited.json` | tiles changed by hand, which generating leaves alone | [schema](../schema/edited.schema.json) |
| `places/continents/<c>/land/<bx>_<bz>.f32` | a block of the land grid | [land grid](land-grid.md) |
| `places/continents/<c>/plates.json` | the continent's plates and their hashes | [schema](../schema/plates-index.schema.json) |
| `places/continents/<c>/plates/<layer>/<px>_<pz>.plate` | 16×16 tiles of a layer | [plates](plates.md) |
| `places/continents/<c>/index.json` | which tiles exist, their layers and the zones touching them | [schema](../schema/continent-index.schema.json) |
| `places/continents/<c>/thumbs/<cx>/<cz>.png` | small pictures of 16×16 tiles, 16 px a tile | PNG |
| `places/continents/<c>/thumbs/index.json` | what each tile's picture was drawn from | [schema](../schema/thumbs-index.schema.json) |

`<c>` is a continent key from `world.json`. Ids are 8 lowercase base-36 characters.

The editor also holds tiles as [tile files](tile-file.md) at `places/continents/<c>/tiles/<layer>/<tx>/<tz>.dlt.gz` while a world is open. It never stores them.

## Coordinates

Coordinates are feet in continent space: x east, z south, y up. A tile is 512 ft a side (64 cells of 8 ft), and tile `(tx, tz)` covers `[tx * 512, (tx + 1) * 512)` each way. Sketches and zone regions use tile units, so `[12.5, 40]` is 6,400 ft east and 20,480 ft south.

## Kept as they are

The editor keeps files it doesn't understand, and saves them back unchanged.
