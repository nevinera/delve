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
