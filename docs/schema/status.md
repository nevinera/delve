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
| `type` | string | yes | `"stat"`, `"recurring"`, `"none"`, or `"triggered"`. |
| `condition` | StatusEffectCondition | no | Gates whether this effect is mechanically live right now. Omitted means always live. See below. Re-evaluated roughly once per server tick (~100ms) - not instantaneous. |

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

A `recurring` effect whose condition is unmet when a tick comes due just skips that tick - the tick-rate cadence keeps counting regardless, so it isn't "saved up" and doesn't catch up once the condition becomes true again.

---

### triggered

Fires `effect` once whenever `trigger` currently holds, throttled by `internalCooldown`. Unlike `condition` (which gates whether another effect is continuously live), `triggered` fires a one-shot effect - and unlike `recurring`, it isn't on a fixed clock, it's reactive to combat. Not edge-triggered: as long as `trigger` keeps holding, it keeps refiring at the cooldown's pace, not just once at the moment it first becomes true.

| Field | Type | Required | Notes |
|---|---|---|---|
| `trigger` | StatusTrigger | yes | What causes this to fire. See below. |
| `internalCooldown` | float | yes | Seconds between fires, minimum. `0` means unthrottled - fires every tick `trigger` holds. |
| `effect` | TriggeredEffect | yes | What happens when it fires. See below. |

```json
{
  "type": "triggered",
  "trigger": { "type": "healthBelow", "threshold": 20.0 },
  "internalCooldown": 3.0,
  "effect": { "type": "heal", "affects": "self", "amount": 15.0 }
}
```

#### StatusTrigger

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | `"healthAbove"`, `"healthBelow"`, `"takesDamage"`, or `"dealsDamage"`. |
| `threshold` | float | for `healthAbove`/`healthBelow` | 0-100. The unit holding this status is what's checked - there's no separate "self vs target" choice here (compare [StatusEffectCondition](#statuseffectcondition)'s `selfHealthPct`, which does apply to whichever unit holds it too). |

`takesDamage`/`dealsDamage` hold for the tick any harm - a basic attack, a power's `harm` effect, or a `recurring` StatusEffect tick - actually connects (0 mitigated by a miss/avoid doesn't count) with the unit holding this status as the target/attacker, respectively.

#### TriggeredEffect

Deliberately smaller than [PowerEffect](power_effect.md): no range/LOS check (this fires reactively, from combat that's already happening, not a fresh cast), and `affects` is only `"self"` or `"target"` (the holder's own current target) - never `bAll`/`gAll`/`gTarget`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | `"harm"`, `"heal"`, `"resource"`, or `"status"` - same meanings as [PowerEffect](power_effect.md). |
| `affects` | string | yes | `"self"` or `"target"`. A `"target"` effect is a no-op if the holder has no current target. |
| `amount` | float \| floatRange | for `harm`/`heal` | |
| `school` | string | no, default `"physical"` | `harm` only. |
| `resourceName` | string | for `resource` | |
| `delta` | float | for `resource` | |
| `duration` | float | for `status` | |
| `status` | Status | for `status` | May itself have `condition`/`triggered` effects - triggers can compose. |

---

## StatusEffectCondition

Gates a single StatusEffect on live combat state, independent of the Status's own duration/expiry. Re-evaluated roughly once per server tick, so treat it as "current within ~100ms", not instantaneous.

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | `"hasStatus"`, `"selfHealthPct"`, `"targetHealthPct"`, or `"casterResource"`. |

### hasStatus

True while another named status is active on the same unit holding this one (any applier).

| Field | Type | Required | Notes |
|---|---|---|---|
| `statusName` | string | yes | The `Status.name` to check for. |

### selfHealthPct / targetHealthPct

True while the unit holding this status (`selfHealthPct`) or that unit's own current target (`targetHealthPct`) is above/below a health percentage. `targetHealthPct` is false if the holder has no target.

| Field | Type | Required | Notes |
|---|---|---|---|
| `comparison` | string | yes | `"above"` or `"below"` (strict, no equality). |
| `threshold` | float | yes | 0-100. |

### casterResource

True while a named resource on whoever applied this status (not the holder, unless they applied it to themselves) is above/below a raw value. False if the applier has left the instance, or has no resource by that name.

| Field | Type | Required | Notes |
|---|---|---|---|
| `resourceName` | string | yes | Must match the applier's resource `name`. |
| `comparison` | string | yes | `"above"` or `"below"`. |
| `threshold` | float | yes | Compared against the resource's current value (not a percentage - resource maxes vary by class). |

```json
{ "type": "selfHealthPct", "comparison": "below", "threshold": 30.0 }
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
