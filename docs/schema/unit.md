# Unit

A Unit is a placed instance of a UnitType on a map. Units are defined in the `units` array of a Map, and reference UnitTypes defined on the enclosing Zone.

See [common.md](common.md) for `Location` and `Position`.

## Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `unitType` | string | yes | | Key into the enclosing zone's `unitTypes` map. |
| `position` | Position | yes | | Placement location and initial facing direction. |
| `hostility` | string | yes | | `"hostile"`, `"neutral"`, or `"friendly"`. Determines token color and aggro behavior. |
| `currentHpFraction` | float | no | `1.0` | Starting HP as a fraction of `maxHP`. Range: 0.0-1.0. |
| `movement` | UnitMovement | no | `{ "type": "still" }` | How the unit moves when un-aggro'd. |
| `identifier` | string | no | | Optional identifier for this unit, used in `links`. |
| `links` | array of strings | no | `[]` | Identifiers of other units that aggro when this unit aggros. |

---

## UnitMovement

Defines how an un-aggro'd unit moves around its map.

> **Note:** None of these movement types perform pathfinding. Units move in straight lines between positions. Ensure patrol paths and wander zones do not intersect barriers, or the unit may become stuck. Pathfinding only occurs after a unit is aggro'd.

### Common Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | `"still"`, `"patrol"`, or `"wander"`. |

### still

The unit does not move. No additional fields.

```json
{ "type": "still" }
```

### patrol

The unit moves through an ordered list of positions.

| Field | Type | Required | Notes |
|---|---|---|---|
| `steps` | array of MovementStep | yes | At least two. |
| `choose` | string | yes | `"return"`  -  reverses back through the list; `"loop"`  -  returns to the first step; `"random"`  -  picks the next step at random. |

**MovementStep fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `position` | Position | yes | Where the unit moves to. |
| `movementRate` | float | yes | Fraction of the unit's movement speed to use. Range: 0.0-1.0. |
| `waitTime` | float \| floatRange | yes | Seconds to wait at this position before moving on. Must be non-negative. |

```json
{
  "type": "patrol",
  "choose": "loop",
  "steps": [
    { "position": { "x": 10.0, "y": 5.0, "angle": 90.0 }, "movementRate": 0.5, "waitTime": 2.0 },
    { "position": { "x": 25.0, "y": 5.0, "angle": 270.0 }, "movementRate": 0.5, "waitTime": 2.0 },
    { "position": { "x": 25.0, "y": 20.0, "angle": 180.0 }, "movementRate": 0.5, "waitTime": 0.0 }
  ]
}
```

### wander

The unit roams randomly within a radius of a fixed point.

| Field | Type | Required | Notes |
|---|---|---|---|
| `location` | Location | yes | Center of the wander zone. |
| `radius` | float | yes | Radius in feet within which the unit roams. |
| `speed` | float \| floatRange | yes | Fraction of the unit's base movement speed. Range: 0.1-1.0. |
| `waitTime` | float \| floatRange | yes | Seconds to wait at each position before moving again. Must be non-negative. |

```json
{
  "type": "wander",
  "location": { "x": 30.0, "y": 22.0 },
  "radius": 8.0,
  "speed": [0.2, 0.4],
  "waitTime": [1.0, 4.0]
}
```

---

## Example

```json
{
  "unitType": "goblin_raider",
  "position": { "x": 15.0, "y": 10.0, "angle": 180.0 },
  "hostility": "hostile",
  "identifier": "raider_a",
  "links": ["raider_b"],
  "movement": {
    "type": "patrol",
    "choose": "return",
    "steps": [
      { "position": { "x": 15.0, "y": 10.0, "angle": 180.0 }, "movementRate": 0.4, "waitTime": 3.0 },
      { "position": { "x": 15.0, "y": 18.0, "angle": 0.0 }, "movementRate": 0.4, "waitTime": 3.0 }
    ]
  }
}
```
