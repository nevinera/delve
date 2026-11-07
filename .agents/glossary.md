# Glossary

## World sizes

- **Cell:** 4 ft square, the ground's smallest piece.
- **Chunk:** 8×8 cells, 32 ft.
- **Tile:** 8×8 chunks, 256 ft.
- **Plate:** 8×8 tiles, 2,048 ft. Full detail, loaded as you get near.
- **Platter:** 8×8 plates, 16,384 ft. Holds renditions.
- **Rendition:** a low-poly version of a tile or plate, stored with a hash of its source.
- **Continent:** one open-world map in a world.
- **World:** a repo of files holding continents, objects and game data.
- **Version 2:** the current world format. `client/src/v2/` is its code. `/create` refuses anything else, and `script/convert-v2.mjs` converts version 1 worlds.

## Building

- **Builder:** the person walking and flying around in `/create`, and the figure they steer.
- **Slab:** a flat piece placed by hand for a floor, wall, roof, ramp or stairs.
- **Object:** a placed thing, either a built-in kind or `built:<id>` from the world's library.
- **Variant set:** built objects in one collection sharing a set name; placing one switches to a random other.
- **Template:** a group of slabs and objects kept in the library and placed as copies.
- **Placed file:** a plate's JSON of hand-placed objects and slabs.
- **Slots:** a tile's generated object positions, from a seed.
- **Course:** a river or stream. **Body:** a sea, lake, pond or swamp pool.
- **Road:** a footpath, trail or road, the three kinds; "road" is also the widest kind. **Bed:** a road's height down its middle.
- **Cut:** how far a course or road moves the ground at a corner, down, or up where it builds it up.

## Caves

- **Cave network:** a named set of connected caves. Each 32 ft chunk belongs to one network.
- **Entrance, point, segment:** a network's layout. Segments join points, and carving opens them into air.
- **Layout and polish:** a network's two phases. Layout carves again on every change. Polish is burned in, so hand edits stay.
- **Span:** a run of air in a 2 ft column.
- **Mouth:** where an entrance opens through the ground.
- **Cavern:** a big open cave. Never "chamber".

## Playing

- **Layer:** a parallel copy of the open world on the game server. It means nothing else.
- **Token:** the signed, time-limited credential for entering the game. Never "ticket".
- **Rest point:** a place in a world that a character can make their **home**. **Homeward** is the ability every class has that takes them back to it.
- **Bot:** a script playing a character (`script/game/bot`).
- **Mob:** a creature in play, any unit the game server runs that isn't a player. A **training dummy** is a mob that never dies or fights back unless you spar with it.
- **Area:** a polygon on a continent, of any size, with its own id, kept in `regions.json`. Areas can overlap. Zones, regions, spawn areas and rest points point at them by id.
- **Zone:** a named part of a continent. **Region:** a named sub-zone, inside one zone.
- **Effect area:** the ground an ability's effect covers, or a lasting `effectArea` effect or aura that keeps a status on those inside. Never just "area" or "zone".

## Creature names

Use the names in the `bodies` files and in [formats.md](formats.md#creatures). Suffixes carry meaning:

- **-shaug:** from the abyss.
- **-ite:** from an elemental plane.
- **-kin:** a thinking creature like an animal, such as boarkin. Peoples with their own names (boric, drakel, ursol, amphen) take it as an insult.
- **Aberrant:** from the far beyond. It's a category with no suffix, as undead and beasts are.

Names from myth and folklore stay as they are.

## Words we avoid

| Avoid | Use |
| --- | --- |
| the name of another game | the rule itself |
| ticket | token |
| chamber | cavern |
| layer, for anything but parallel world copies | whatever it is: plate, band, level |
| zone or area, for what an ability covers | effect area |
