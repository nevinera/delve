# PowerEffect

A PowerEffect describes a single mechanical outcome applied when a power fires.

## Common Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | Discriminator. See types below. |
| `tags` | array of strings | no | Max 24 tags; each at most 16 characters. |

`float | floatRange` fields accept either a single float or a `[min, max]` pair (see [common.md](common.md)). A single float is treated as `[value, value]`. The `range` field uses `rangeFloat` instead: a single float `x` means `[0, x]`.

### Affects Values

Used by several effect types:

| Value | Meaning |
|---|---|
| `bTarget` | A single selected hostile target |
| `gTarget` | A single selected friendly target |
| `bAll` | All hostile units within range |
| `gAll` | All friendly units within range |
| `self` | The unit using the power |

For an NPC, the friendly units are itself and its living pack (units sharing its `groupIdentifier` on the same map) within the effect's `range`. `gTarget` picks the most wounded one; a `heal` only counts wounded units, so a healer holds its power until someone is hurt. `bTarget` is the unit's current hostile target; an NPC's `bAll` hits every living player on its map within `range` that it has line of sight to, centered on the NPC (for an area centered on the target, use `radius`, below).

For a player, `bAll` hits every living hostile or neutral NPC on their map within `range` of the player, with line of sight (never players or friendly NPCs), and `gAll` is just the player themselves until there are parties. Neither needs a target, so a power made only of `self`, `bAll` and `gAll` effects can be used with nothing targeted; give its graphics `"from": "self", "to": "self"` so they play around the caster.

### radius (splash around the target)

Any `harm`, `heal`, `resource` or `status` effect with `affects` of `bTarget` or `gTarget` may set `radius` (feet, greater than 0). It still lands on the target, and also on every other unit of the same side within `radius` of the target, with line of sight from the target: a fireball's splash, a burst heal on an ally. `range` is still how far the caster can be from the target.

| Caster | `bTarget` + `radius` | `gTarget` + `radius` |
|---|---|---|
| Player | The target, plus every living hostile or neutral NPC around it. | Just the target, until there are parties. |
| NPC | Its target, plus every living player around it. | The most wounded packmate in range, plus every packmate around it the effect can land on (a heal only reaches the wounded). |

```json
{ "type": "harm", "affects": "bTarget", "range": 30.0, "radius": 8.0, "amount": [6.0, 9.0], "school": "magic" }
```

The client marks every area automatically when the power fires: a faint ring around the caster at a `bAll`/`gAll` effect's `range`, and around the target at a `radius` (when the projectile lands, for a power with a `speed`). Red for hostile effects, green for friendly ones. It plays alongside the power's own graphics, in the game and in the editors' previews.

---

## harm

Deals damage to one or more targets.

| Field | Type | Required | Notes |
|---|---|---|---|
| `affects` | string | yes | Must not be `"self"`. |
| `amount` | float \| floatRange | yes | Damage dealt. For a player, scaled by their primary stat - see [stats.md](../stats.md#authored-amount-scaling). |
| `range` | rangeFloat | yes | Distance in feet to a valid target. |
| `school` | string | no, default `"physical"` | `"physical"` or `"magic"`. Picks which of the target's Avoidance/Defence Rating pools mitigates this effect - see [stats.md](../stats.md). Not the same as `tags` (which is free-form and has no mechanical effect). |

### Example

```json
{
  "type": "harm",
  "affects": "bTarget",
  "range": 5.0,
  "amount": [2.0, 4.0],
  "school": "physical",
  "tags": ["melee"]
}
```

---

## heal

Restores HP to one or more targets.

| Field | Type | Required | Notes |
|---|---|---|---|
| `affects` | string | yes | |
| `amount` | float \| floatRange | yes | HP restored. For a player, scaled by their primary stat - see [stats.md](../stats.md#authored-amount-scaling). |
| `range` | rangeFloat | unless `affects` is `"self"` | Distance in feet to a valid target. |

### Example

```json
{
  "type": "heal",
  "affects": "self",
  "amount": [3.0, 5.0],
  "tags": ["magic"]
}
```

---

## resource

Modifies a named resource on one or more targets.

| Field | Type | Required | Notes |
|---|---|---|---|
| `affects` | string | yes | |
| `resourceName` | string | yes | Name of the resource to modify (must match the target's resource `name`). |
| `delta` | float | yes | Amount added to the resource. Negative values consume it. |
| `range` | rangeFloat | unless `affects` is `"self"` | Distance in feet to a valid target. |

### Example

```json
{
  "type": "resource",
  "affects": "self",
  "resourceName": "fury",
  "delta": 3.0,
  "tags": ["melee"]
}
```

---

## status

Applies a Status to one or more targets for a fixed duration. See [status.md](status.md) for the Status schema.

| Field | Type | Required | Notes |
|---|---|---|---|
| `affects` | string | yes | |
| `duration` | float | yes | Duration in seconds. |
| `status` | Status | yes | The status to apply. |
| `range` | rangeFloat | unless `affects` is `"self"` | Distance in feet to a valid target. |

### Example

```json
{
  "type": "status",
  "affects": "self",
  "duration": 10.0,
  "status": {
    "name": "Enrage",
    "shortName": "Enrage",
    "treatAs": "buff",
    "stacking": "replace",
    "effects": [
      { "type": "stat", "statName": "damageDone", "modifierType": "multiply", "amount": 1.1 },
      { "type": "stat", "statName": "attackSpeed", "modifierType": "multiply", "amount": 1.2 }
    ]
  },
  "tags": ["buff"]
}
```

---

## groundArea

Creates a persistent area on the ground. Every `tickInterval` seconds, its `onTick` effects are applied to each living unit standing inside the shape. Fire zones, healing circles, and the like.

The area is fixed where it was created: it does not follow the caster or the target afterwards. The first tick lands one `tickInterval` after the cast. Units are tested by position only (no line-of-sight check). The area ends after `duration` seconds. If the same caster creates a `groundArea` from the same ability at the same spot, the old one is refreshed instead of stacking.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `shape` | Shape | yes | | The area's footprint. See below. |
| `affects` | string | yes | | `"bAll"` (hostile units), `"gAll"` (friendly units), or `"all"` (both). Which side counts as hostile or friendly is relative to the caster, same as [Affects Values](#affects-values). |
| `range` | rangeFloat | when the shape is anchored on the target | | How far the caster can be from the target. Omit when the shape is anchored on `self`. |
| `duration` | float | yes | | Seconds the area lasts. |
| `tickInterval` | float | no | `1.0` | Seconds between applications of `onTick`. |
| `onTick` | array of PowerEffect | yes | | `harm`, `heal`, `resource` and `status` effects, applied to each qualifying unit inside the shape per tick. Nested effects omit `affects` and `range` (the area decides who is hit and from where). At least one entry, and no nested `groundArea`. |
| `endsOnCasterDeath` | boolean | no | `false` | When `true`, the area vanishes when its caster dies. An area made by the caster's own `onDeath` power is not affected. |
| `graphic` | GroundAreaGraphic | no | translucent red (`bAll`), green (`gAll`) or yellow (`all`) fill | How the area is drawn. See below. |

### Shape

| `type` | Anchored at | Fields |
|---|---|---|
| `circle` | `at`: `"self"` or `"target"` | `radius` (feet, > 0) |
| `ring` | `at`: `"self"` or `"target"` | `innerRadius` (feet, >= 0), `outerRadius` (feet, > `innerRadius`) |
| `line` | the caster | `length`, `width` (feet, > 0), `direction` |
| `cone` | the caster | `offset` (feet, >= 0), `length`, `width` (feet, > 0), `direction` |

`direction` is `"target"` (point from the caster toward the target) or `"facing"` (the way the caster is facing). It defaults to `"target"` when the effect has a `range` (it needs a target anyway) and `"facing"` otherwise.

A `cone` starts `offset` feet in front of the caster as a point, and widens as a parabola to `width` feet across at `length` feet from the caster. A `line` is a rectangle of the given `length` and `width`, starting at the caster.

A shape with `at: "target"`, or `direction: "target"`, needs a target when used, and the effect must give a `range`. A shape anchored only on the caster (`at: "self"`, or `direction: "facing"`) needs no target and no `range`.

### GroundAreaGraphic

Client-only; ignored by the game server. Drawn as a flat translucent layer on the ground, slightly above it (a quarter of a token's height), underneath tokens.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `color` | Color | no | | Solid fill color. If `textureURL` is also set, the texture is tinted by it (see [common.md](common.md#color)). |
| `textureURL` | string | no | | Image tiled across the shape, or a stock asset reference (see [common.md](common.md#stock-asset-reference)). |
| `textureScale` | float | no | `5.0` | Feet per tile. Only meaningful with `textureURL`. |
| `opacity` | float | no | `0.5` | From `0.0` (invisible) to `1.0` (fully opaque). |

### Example

```json
{
  "type": "groundArea",
  "shape": { "type": "circle", "at": "target", "radius": 8.0 },
  "affects": "bAll",
  "range": 30.0,
  "duration": 12.0,
  "tickInterval": 1.0,
  "onTick": [
    { "type": "harm", "amount": [2.0, 3.0], "school": "magic" }
  ],
  "graphic": { "color": "#ff5a1f", "opacity": 0.5 },
  "tags": ["fire"]
}
```
