# Status

A Status is a named effect applied to a unit for a fixed duration.

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Identifier used for stacking checks and display. |
| `treatAs` | string | yes | `"buff"`, `"debuff"`, or `"inherent"`. Affects UI display and certain game mechanics. |
| `stacking` | string | yes | `"extend"`, `"replace"`, or `"stack"`. How a second application behaves when the status is already active on the target. |
| `maxStacks` | integer | no | Maximum number of stacks. Only meaningful when `stacking` is `"stack"`. Must be 1 or greater. |
| `effects` | array of StatusEffect | yes | Mechanical effects applied while the status is active. May be empty. |

### Stacking Behavior

| Value | Behavior |
|---|---|
| `extend` | Resets the duration to the full value. |
| `replace` | Removes the existing application and applies a fresh one. |
| `stack` | Adds a new independent application up to `maxStacks`. |

---

## StatusEffect

A StatusEffect describes one mechanical outcome of a status being active on a unit.

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | `"stat"`, `"recurring"`, or `"none"`. |

---

### none

A named status with no mechanical effect. Useful for conditions that other powers or scripted logic check by name.

No additional fields.

---

### stat

Applies a continuous modifier to one of the unit's stats while the status is active.

| Field | Type | Required | Notes |
|---|---|---|---|
| `statName` | string | yes | The stat to modify. See stat names below. |
| `modifierType` | string | yes | `"multiply"` or `"add"`. |
| `amount` | float | yes | The multiplier or addend. |

**Stat names** (not exhaustive):

| Name | Description |
|---|---|
| `strength` | Physical damage output |
| `agility` | Attack speed and dodge |
| `maxHp` | Maximum hit points |
| `movementSpeed` | Movement speed |
| `attackSpeed` | Attack animation and cooldown rate |
| `damageDone` | All outgoing damage |
| `damageTaken` | All incoming damage |
| `healingDone` | All outgoing healing |
| `healingTaken` | All incoming healing |

```json
{ "type": "stat", "statName": "damageDone", "modifierType": "multiply", "amount": 1.1 }
```

---

### recurring

Applies a heal or harm tick at a regular interval while the status is active.

| Field | Type | Required | Notes |
|---|---|---|---|
| `tickRate` | float | yes | Seconds between ticks. |
| `onTick` | string | yes | `"heal"` or `"harm"`. |
| `amount` | float | yes | HP healed or damage dealt per tick. |

```json
{ "type": "recurring", "tickRate": 2.0, "onTick": "harm", "amount": 5.0 }
```

---

## Example

```json
{
  "name": "Enrage",
  "treatAs": "buff",
  "stacking": "replace",
  "effects": [
    { "type": "stat", "statName": "damageDone", "modifierType": "multiply", "amount": 1.1 },
    { "type": "stat", "statName": "attackSpeed", "modifierType": "multiply", "amount": 1.2 }
  ]
}
```
