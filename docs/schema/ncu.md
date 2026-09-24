# NCU

A non-combat unit: a character placed on a map that can move around and talk, but never fights. NCUs are defined in the `ncus` array of a Map. Unlike [Units](unit.md), they have no UnitType; everything about them is set inline.

NCUs can't be targeted, attacked, or healed, and never aggro. A player talks to one by right-clicking it within 10 feet of its token.

See [common.md](common.md) for `Position`, and [unit.md](unit.md#unitmovement) for `UnitMovement`.

## Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `identifier` | string | yes | | Unique among the zone's NCUs. |
| `name` | string | yes | | Display name, shown on its token and in its dialogue window. |
| `tokenImageUrl` | string | yes | | Portrait image URL, relative to the file it's written in. |
| `tokenRadius` | float | yes | | Token radius in feet. Range: 1.0-20.0. |
| `speedFactor` | float | no | `1.0` | Movement speed multiplier relative to base character speed. Range: 0.0-10.0. |
| `position` | Position | yes | | Placement location and initial facing direction. |
| `movement` | UnitMovement | no | `{ "type": "still" }` | Same movement types as a unit's. |
| `dialogue` | array of strings | no | | Lines a player clicks through one at a time. Each must be non-empty. Without dialogue, an NCU can't be talked to. |

## Example

```json
{
  "identifier": "grizzle",
  "name": "Grizzle",
  "tokenImageUrl": "../../tokens/unit/goblin-2.webp",
  "tokenRadius": 2.0,
  "speedFactor": 0.8,
  "position": { "x": 62.0, "y": 12.0, "angle": 180.0 },
  "movement": { "type": "wander", "location": { "x": 62.0, "y": 12.0 }, "radius": 4.0, "speed": 0.3, "waitTime": [4.0, 8.0] },
  "dialogue": [
    "Psst. You. Don't go in there.",
    "If anyone asks, you never saw me."
  ]
}
```
