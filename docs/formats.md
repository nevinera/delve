# Zone File Formats

## Coordinate System

All JSON formats use **map coordinates**:

- Origin `(0, 0)` = lower-left corner of the map
- `+X` = east (right on map)
- `+Y` = north (up on map)
- 1 unit = 1 foot

> **Internal note:** the Three.js renderer uses a different convention (`x`/`z` axes, `z` increasing southward). Descriptor classes note this distinction and callers are responsible for converting before construction.

---

## Unit

A unit is a single combatant token rendered in the scene.

JSON Schema: [schema/unit.json](schema/unit.json)

### Fields

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes | - | Display name shown on the token arc |
| `tokenColor` | string | no | `#8B0000` | CSS hex color for the token body cylinder |
| `maxHP` | integer | yes | - | Maximum hit points |
| `currentHP` | integer | no | `maxHP` | Current hit points |
| `tokenImageUrl` | string | yes | - | URL of the token portrait image |
| `facingAngle` | number | no | none | Facing direction in radians (see below). Omit for no facing indicator |
| `location` | object | yes | - | Map-coordinate position in feet: `{ "x": float, "y": float }` |
| `tokenScale` | number | no | `1.0` | Token size multiplier (0.25-5.0). 1.0 = 3-foot diameter |

### Facing Angle

`facingAngle` is in radians, standard compass bearing (0 = north, clockwise positive):

| Value | Direction |
|---|---|
| `0` | North (upward on map) |
| `Math.PI / 2` | East |
| `Math.PI` | South (downward on map) |
| `-Math.PI / 2` | West |

To face a unit at another unit, compute `atan2(target.x - self.x, target.y - self.y)`.

### Token Scale Reference

| Scale | Creature Size |
|---|---|
| `0.5` | Tiny |
| `0.75` | Small |
| `1.0` | Medium |
| `2.0` | Large |
| `3.0` | Huge |
| `4.0` | Gargantuan |

### Example

```json
{
  "name": "Goblin Raider",
  "tokenColor": "#8B2500",
  "maxHP": 20,
  "currentHP": 14,
  "tokenImageUrl": "/assets/tokens/goblin-green.webp",
  "facingAngle": 0.38,
  "location": { "x": -1.3, "y": 21.8 },
  "tokenScale": 0.75
}
```

---

## Zone

A zone describes a complete dungeon encounter: the map, walls, starting positions, and all units present.

JSON Schema: [schema/zone.json](schema/zone.json)

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Human-readable zone name |
| `mapUrl` | string | yes | URL of the dungeon map image |
| `dimensions` | object | yes | Map size in feet: `{ "width": float, "height": float }` |
| `startingLocations` | array | no | Candidate spawn points for players: `[{ "x": float, "y": float, "facing": float }, ...]` |
| `walls` | array | yes | Wall paths (see below) |
| `units` | array | yes | Units present (each conforms to the Unit format above) |

### Wall Paths

`walls` is an array of paths. Each path is an ordered array of at least two `{ "x", "z" }` points. Adjacent points in a path are connected into a single mitered wall slab - corners between segments are joined cleanly rather than overlapping. Disconnected wall runs are separate entries in the outer array.

### Example

```json
{
  "name": "Goblin Cave",
  "mapUrl": "/assets/maps/dungeon.png",
  "dimensions": { "width": 225, "height": 185 },
  "startingLocations": [
    { "x": 0, "y": 25, "facing": 3.14159 },
    { "x": 2, "y": 25, "facing": 3.14159 }
  ],
  "walls": [
    [
      { "x": -67.5, "y": 7.5 },
      { "x": -42.5, "y": 7.5 },
      { "x": -42.5, "y": 12.5 },
      { "x": -32.5, "y": 17.5 },
      { "x": -12.5, "y": 2.5 },
      { "x": 2.5,   "y": -17.5 }
    ]
  ],
  "units": [
    {
      "name": "Tyllani",
      "tokenColor": "#228B22",
      "maxHP": 40,
      "currentHP": 34,
      "tokenImageUrl": "/assets/tokens/tyllani.webp",
      "location": { "x": 0, "y": 25 }
    },
    {
      "name": "Goblin Raider",
      "tokenColor": "#8B2500",
      "maxHP": 20,
      "currentHP": 14,
      "tokenImageUrl": "/assets/tokens/goblin-green.webp",
      "facingAngle": 0.38,
      "location": { "x": -1.3, "y": 21.8 },
      "tokenScale": 0.75
    }
  ]
}
```
