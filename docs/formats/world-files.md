# A world's files

A world is a directory of files, usually a GitHub repo. Paths are relative to its root. `client/src/world/paths.js` builds and parses every one of them, so use it rather than writing paths by hand.

| Path | What it is | Format |
| --- | --- | --- |
| `world.json` | name, level cap, continents and dungeons, and in version 2 worlds the spawn point | [schema](../schema/world.schema.json) |
| `collections.json` | the world's object collections | [schema](../schema/collections.schema.json) |
| `template-collections.json` | the world's template collections | [schema](../schema/collections.schema.json) |
| `objects/<id>.json` | a built object | [schema](../schema/object.schema.json) |
| `templates/<id>.json` | a [template](templates.md): slabs and objects placed together | [schema](../schema/template.schema.json) |
| `textures/<id>.json` | an image objects and slabs wear | [schema](../schema/image.schema.json) |
| `shapes.json` | the hulls line of sight tests against, written by the editor | [shapes](shapes.md) |
| `models.json` | the world's own bodies, and the patterns and colorations it adds to shipped ones, which every continent shares | [bodies](bodies.md#a-worlds-models) |
| `classes/`, `abilities/`, `statuses/`, `items/`, `item-templates/`, `creatures/`, `npcs/`, `dialogues/` | game data, each `<id>.json` | [game data](game-data.md) |
| `places/continents/<c>/sketch.json` | pins, road paths, rivers and lakes | [schema](../schema/sketch.schema.json) |
| `places/continents/<c>/zones/<key>.json` | a zone: a name and a region | [schema](../schema/zone.schema.json) |
| `places/continents/<c>/spawns.json` | spawn regions, and mobs and NPCs placed one at a time | [game data](game-data.md#spawns) |
| `places/continents/<c>/edited.json` | tiles changed by hand, which generating leaves alone | [schema](../schema/edited.schema.json) |
| `places/continents/<c>/land/<bx>_<bz>.f32` | a block of the land grid | [land grid](land-grid.md) |
| `places/continents/<c>/plates.json` | the continent's plates and their hashes | [schema](../schema/plates-index.schema.json) |
| `places/continents/<c>/plates/<layer>/<px>_<pz>.plate` | 16×16 tiles of a layer, with their objects and [slabs](slabs.md) | [plates](plates.md) |
| `places/continents/<c>/plates/<px>_<pz>.plate` | in version 2 worlds: 8×8 tiles' ground, biomes, slots, water and cuts | [v2 plates](v2-plates.md) |
| `places/continents/<c>/placed/<px>_<pz>.json` | in version 2 worlds: objects and slabs placed by hand | [placed](placed.md) |
| `places/continents/<c>/caves/<px>_<pz>.caves` | in version 2 worlds: caves' air, column by column, by network | [caves](caves.md) |
| `places/continents/<c>/caves/layout.json` | in version 2 worlds: the cave networks laid out | [cave layout](cave-layout.md) |
| `places/continents/<c>/water.json` | in version 2 worlds: the water's bodies and courses | `client/src/v2/water.js` |
| `places/continents/<c>/platters/<px>_<pz>.platter` | in version 2 worlds: renditions of 64×64 tiles and 8×8 plates | [v2 platters](v2-platters.md) |
| `places/continents/<c>/index.json` | which tiles exist, their layers and the zones touching them | [schema](../schema/continent-index.schema.json) |
| `places/continents/<c>/thumbs/<cx>/<cz>.png` | small pictures of 16×16 tiles, 16 px a tile | PNG |
| `places/continents/<c>/thumbs/index.json` | what each tile's picture was drawn from | [schema](../schema/thumbs-index.schema.json) |

`<c>` is a continent key from `world.json`. Ids are 8 lowercase base-36 characters.

The JSON files that describe things (the world, zones, sketches, objects, templates and [game data](game-data.md)) can have `notes`: free-form text on what a thing is for and its backstory, for whoever changes it later. The game never reads them.

The editor also holds tiles as [tile files](tile-file.md) at `places/continents/<c>/tiles/<layer>/<tx>/<tz>.dlt.gz` while a world is open. It never stores them.

## Coordinates

Coordinates are feet in continent space: x east, z south, y up. A tile is 512 ft a side (64 cells of 8 ft), and tile `(tx, tz)` covers `[tx * 512, (tx + 1) * 512)` each way. Sketches and zone regions use tile units, so `[12.5, 40]` is 6,400 ft east and 20,480 ft south.

## Kept as they are

The editor keeps files it doesn't understand, and saves them back unchanged.
