# ResourceType

A ResourceType defines the class or unit-type specific resource used to power abilities.

## Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | yes | | Display name shown in UI (e.g. `"mana"`, `"rage"`, `"souls"`). |
| `color` | Color | yes | | Resource bar color (see [common.md](common.md#color)). |
| `max` | float | yes | | Maximum value. |
| `defaultValue` | float | yes | | Starting value, and the value the resource passively returns toward. |
| `returnRate` | float | no | `0.0` | Rate per second at which the resource moves toward `defaultValue`. Must be non-negative. |
| `isFluid` | boolean | yes | | `true` for quantitative resources (mana, energy); `false` for discrete ones (combo points, souls). |
| `displayType` | string | no | | Only legal value is `"primary"`. Meaningful only in [CharacterClass](character_class.md#fields)'s `resources` array (which may list several): marks the one resource that's displayed, regenerated, and spent by ability costs. Exactly one entry in a class's `resources` must set this. Not used on [UnitType](unit_type.md#fields)'s single `resource` - it's implicitly the only one. |
| `hasteAffected` | boolean | no | `false` | When `true`, `returnRate` is scaled up by the unit's Haste% (the same physical/magic pool its basic attack uses, per [stats.md](../stats.md#haste-rating)) before being applied each tick. |
| `recoveryAffected` | boolean | no | `false` | When `true`, `returnRate` is scaled up by the unit's Recovery Rating (per [stats.md](../stats.md#recovery-rating)) before being applied each tick - independent of, and stacks multiplicatively with, `hasteAffected`. Meant for mana-like resources on a class. |

## Examples

### Mana (fluid, regenerating)

```json
{
  "name": "mana",
  "color": "4488FF",
  "max": 100.0,
  "defaultValue": 100.0,
  "returnRate": 2.0,
  "isFluid": true
}
```

### Rage (fluid, decaying)

```json
{
  "name": "rage",
  "color": "CC2200",
  "max": 100.0,
  "defaultValue": 0.0,
  "returnRate": 5.0,
  "isFluid": true
}
```

### Combo Points (discrete, no passive change)

```json
{
  "name": "combo points",
  "color": "FFCC00",
  "max": 5.0,
  "defaultValue": 0.0,
  "isFluid": false
}
```
