# ResourceType

A ResourceType defines the class or unit-type specific resource used to power abilities.

## Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | yes | | Display name shown in UI (e.g. `"mana"`, `"rage"`, `"souls"`). |
| `color` | string | yes | | Resource bar color as a 6-digit hex string (no leading `#`). |
| `max` | float | yes | | Maximum value. |
| `defaultValue` | float | yes | | Starting value, and the value the resource passively returns toward. |
| `returnRate` | float | no | `0.0` | Rate per second at which the resource moves toward `defaultValue`. Must be non-negative. |
| `isFluid` | boolean | yes | | `true` for quantitative resources (mana, energy); `false` for discrete ones (combo points, souls). |

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
