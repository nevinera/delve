# zone-build.json

A zone's build settings, for `bin/zone-build`: what it needs to turn a zone plan into a zone.
It sits beside the zone's plan, at `worlds/WORLD/zones/ZONE/zone-build.json`; the plan
(`zone-plan.md`) says what the zone is for in prose, and this says how to build it.

```json
{
  "name": "Thornwood",
  "description": "Forest full of wild creatures, with a few human camps.",
  "elvl": 0,
  "start": true,
  "unitTypes": ["wolf", "boar", "deer"],
  "maps": {
    "ranger-outpost": {
      "elvl": 0, "theme": "glade", "size": [100, 100], "tags": ["hub", "paths"], "entry": true,
      "exits": {"north": "woodcutters-clearing", "south": "old-growth"},
      "annotations": {"intent": "The ranger outpost: the zone's hub."}
    },
    "old-growth": {
      "elvl": 2, "theme": "glade", "size": [120, 110], "tags": ["rough", "paths"],
      "exits": {"north": "ranger-outpost", "east": {"zone": "brackwater-mire", "map": "reedtalker-village", "at": 0.3}}
    }
  }
}
```

## Zone fields

| Field | Required | Notes |
|---|---|---|
| `name` | yes | The zone's name. |
| `description` | no | |
| `elvl` | yes | The zone's elevation; maps default to it. |
| `private` | no | `true` for a dungeon (party-instanced). Default `false`. |
| `start` | no | `true` for a zone players start in: its entry maps become the world's entry points. |
| `unitTypes` | no | Unit type keys from the content library (`unit_types/`, by file name). Copied into the world with their tokens. |
| `maps` | yes | Map identifier to map settings, in the order the zone lists them. |
| `annotations` | no | Merged into the zone's annotations. |

## Map fields

| Field | Required | Notes |
|---|---|---|
| `name` | no | Default: the identifier, title-cased. |
| `elvl` | no | Default: the zone's. |
| `theme` | yes | A cell map theme (`glade`, `autumn`, `cave`, ...). |
| `size` | yes | `[cols, rows]`, 8 to 200 each. Cells are 5 ft across. |
| `tags` | no | Generator tags (see `client/src/cellMap/generate.js`). |
| `seed` | no | Default: one from the identifier, so the map comes out the same each build. |
| `exits` | no | Side (`north`, `east`, `south`, `west`) to where it leads: a map in this zone, by identifier (which must have an exit back), or `{"zone", "map"}` in another. Either form can be `{"map", "at"}` with `at` how far along the side the exit sits, 0 to 1 (west to east, north to south). At most one per side. |
| `entry` | no | `true` gives the map an `arrival` point near its middle, and makes it one of the zone's entry points. |
| `annotations` | no | Written onto a new map. |

## What it writes

- Each map, at `ZONE/MAP/MAP.json`: generated, then walled by Auto Barriers (walls, fill points,
  places, and a line connection per exit, named for its side). A map that already has a file is
  kept, so places, units and annotations added since survive; `--force MAP` regenerates it.
- The zone file, `ZONE/ZONE.json`: its maps, a zone link for each pair of maps that lead to each
  other, an open connection (`MAP-SIDE`) for each exit to another zone, and its entry points.
  Other fields already in it (respawn, items, unit types not in the spec) are kept.
- Unit types, at `WORLD/unit_types/KEY.json`, and their tokens under `WORLD/tokens/`, unless the
  world has them already.
- The world file, `WORLD/WORLD.json` (made if it's missing): the zone's entry, its entry points if
  it's a start zone, and a world link for each exit to another zone that's built with an exit
  back. Build the second zone of a pair and the link appears; the tool lists exits still waiting.
