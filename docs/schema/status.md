# Status

A Status is a named effect applied to a unit for a fixed duration.

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Identifier used for stacking checks and display. |
| `description` | string | no | Short description shown in UI. |
| `shortName` | string | yes | At most 6 characters. Compact text badge shown wherever this status is displayed - there are no status icons, so this is the only way it renders. |
| `treatAs` | string | yes | `"buff"`, `"debuff"`, or `"inherent"`. Affects UI display and certain game mechanics. |
| `stacking` | string | yes | `"extend"`, `"replace"`, or `"stack"`. How a second application behaves when the status is already active on the target. |
| `maxStacks` | integer | no | Maximum number of stacks. Only meaningful when `stacking` is `"stack"`. Must be 1 or greater. |
| `auraEffect` | AuraEffect | no | A single persistent visual (thorns, a shield glow) shown on the unit for as long as the status is active. See [aura_effect.md](aura_effect.md). |
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

**Stat names** - a closed set, split into two tiers by where they plug into the combat math (see [stats.md](../stats.md)):

Tier 1 (input) - the same raw pools itemized gear feeds. `add` is flat rating points; `multiply` is a fraction of the current value.

| Name | Description |
|---|---|
| `strength` | Physical basic-attack/harm scaling, physical Crit/Avoidance |
| `agility` | Physical Haste, a weaker split contribution to both Avoidance pools |
| `intellect` | Magic basic-attack/harm/heal scaling, magic Crit/Haste/Avoidance |
| `stamina` | Feeds `maxHealth` |
| `critRating` | Itemized Crit Rating |
| `hasteRating` | Itemized Haste Rating |
| `masteryRating` | Itemized Mastery Rating |
| `versatilityRating` | Itemized Versatility Rating |
| `defenceRating` | Itemized Defence Rating |

Tier 2 (output) - derived figures, computed by running Tier 1 through the existing formulas. `add` is flat percentage points (or a flat value for `maxHealth`/`movementSpeed`); `multiply` is a scalar on the already-computed result.

| Name | Description |
|---|---|
| `physicalCritChance` / `magicCritChance` | Crit chance for that school |
| `physicalHaste` / `magicHaste` | Haste% for that school |
| `physicalAvoidance` / `magicAvoidance` | Avoidance chance for that school |
| `physicalMitigation` / `magicMitigation` | Defence Rating's damage reduction for that school |
| `masteryValue` | Computed Mastery value |
| `maxHealth` | Maximum hit points |
| `movementSpeed` | Movement speed |
| `attackSpeed` | Basic-attack swing rate - the only lever that also affects an NPC's flat `UnitType.attackSpeed`, which has no Haste Rating to scale from |
| `damageDone` / `physicalDamageDone` / `magicDamageDone` | All outgoing damage, or just one school |
| `healingDone` | All outgoing healing |
| `healingTaken` | All incoming healing |
| `damageTaken` / `physicalDamageTaken` / `magicDamageTaken` | All incoming damage, or just one school |

```json
{ "type": "stat", "statName": "damageDone", "modifierType": "multiply", "amount": 1.1 }
```

---

### recurring

Applies a heal or harm tick at a regular interval while the status is active.

| Field | Type | Required | Notes |
|---|---|---|---|
| `tickRate` | float | yes | Seconds between ticks, before Haste. Haste never shortens the status's own duration - only how often it ticks within that duration. The interval to the *next* tick is decided fresh from the applier's Haste each time a tick is scheduled - at application, and again each time a tick subsequently fires - rather than being fixed once for the whole status or continuously re-evaluated in between. Application counts as the first such scheduling event, so even the first tick's interval is Haste-scaled. A Haste change takes effect starting with whichever tick is scheduled next; if the resulting interval is short enough, an extra tick can fit in before the status expires. |
| `onTick` | string | yes | `"heal"` or `"harm"`. |
| `amount` | float | yes | HP healed or damage dealt per tick, before stat scaling (see [power_effect.md](power_effect.md)'s `harm`/`heal` scaling - the same math applies here). |
| `school` | string | no, default `"physical"` | `"physical"` or `"magic"`. Picks which Haste pool scales the tick interval, and (for `onTick: "harm"`) which of the target's Avoidance/Defence Rating pools mitigates each tick - same as [PowerEffect](power_effect.md)'s `school`. Ignored (always magic) for `onTick: "heal"`, same as a `heal` PowerEffect. |

```json
{ "type": "recurring", "tickRate": 2.0, "onTick": "harm", "amount": 5.0, "school": "magic" }
```

---

## Example

```json
{
  "name": "Enrage",
  "shortName": "Enrage",
  "treatAs": "buff",
  "stacking": "replace",
  "effects": [
    { "type": "stat", "statName": "damageDone", "modifierType": "multiply", "amount": 1.1 },
    { "type": "stat", "statName": "attackSpeed", "modifierType": "multiply", "amount": 1.2 }
  ]
}
```
