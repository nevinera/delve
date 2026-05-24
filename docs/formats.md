# Zone File Formats

## Coordinate System

- `+X` = east (right on screen)
- `+Z` = south (toward camera / bottom of screen)
- `-Z` = north (away from camera / top of screen)
- 1 unit = 1 foot

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
| `location` | object | yes | - | World-space position in feet: `{ "x": float, "z": float }` |
| `tokenScale` | number | no | `1.0` | Token size multiplier (0.25-5.0). 1.0 = 3-foot diameter |

### Facing Angle

`facingAngle` is in radians, measured as `atan2(dx, -dz)` where `(dx, dz)` is the world-space direction vector:

| Value | Direction |
|---|---|
| `0` | South (toward camera) |
| `Math.PI / 2` | East |
| `Math.PI` | North (away from camera) |
| `-Math.PI / 2` | West |

To face a unit at another unit, compute `atan2(target.x - self.x, -(target.z - self.z))`.

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
  "location": { "x": -1.3, "z": 21.8 },
  "tokenScale": 0.75
}
```
