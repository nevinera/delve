# UnitType

A UnitType is a template from which individual units are created in a zone.

See [ability.md](ability.md) for the `Ability` type embedded in `powers`.

## Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | yes | | Display name. |
| `description` | string | no | | Short description shown in UI. |
| `tokenImageUrl` | string \| array of strings | yes | | Portrait image URL(s). If an array, one is chosen at random each time a unit is created from this type. |
| `tokenRadius` | float | yes | | Token radius in feet. Range: 1.0-20.0. |
| `speedFactor` | float | no | `1.0` | Movement speed multiplier relative to base character speed. Range: 0.0-10.0. |
| `aggroRadius` | float | no | `20.0` | Distance in feet at which this unit proactively notices and aggros enemies. Landing a hit on it (basic attack or any power) always aggros it immediately regardless of this radius. |
| `maxHP` | integer | yes | | Maximum hit points. |
| `dps` | float | yes | | Basic-attack damage per second. Damage per swing is `dps / attackSpeed`. |
| `attackSpeed` | float | yes | | Basic-attack rate, in attacks per second. Time between basic attacks is `1 / attackSpeed` seconds. |
| `basicAttackRange` | float | no | `5.0` | Basic-attack range in feet. Leave at the default for melee; set higher (e.g. `30.0`) for a ranged basic attack. |
| `basicAttackSchool` | string | no | `"physical"` | `"physical"` or `"magic"`. Picks the basic-attack visual/sound and which of the target's Avoidance/Defence Rating pools mitigates it - see [stats.md](../stats.md). |
| `basicAttackStyle` | string | no | derived from `basicAttackSchool`/`basicAttackRange` | One of `claw`, `sword`, `axe`, `club`, `arrow`, `arcane`, `ice`, `nature`, `fire`. Purely cosmetic - picks the basic-attack graphic/sound; has no mechanical effect. When omitted, the client falls back to `arcane`/`arrow`/`sword` based on `basicAttackSchool`/`basicAttackRange`. |
| `tags` | array of strings | no | `[]` | Balance tags: which guidelines in [combat_balance.md](../combat_balance.md) the unit type is built against. At most one intended-for tag (`open`, `g1`, `g2`, `g3`, `g5`, `g10`), one pull-size tag (`solo`, `pair`, `group`, `swarm`) and one damage-type tag (`caster`, `melee`, `ranged`); any role tags (`healer`, `tough`, `debuffs`, `buffs`, `glass`), but not both `tough` and `glass`. No tag may repeat. No mechanical effect. |
| `resource` | ResourceType | no | | The resource used to power this unit's abilities. Omit for a unit with no resource (nothing it uses costs one). |
| `powers` | array of Ability \| AssetReference(`referenceTo: "ability"`) | no | `[]` | Abilities available to this unit. Inline Ability objects or references to external ability files. A unit_type containing any AssetReferences is abstract (see [common.md](common.md)). |
| `targeting` | UnitTargeting | no | `{ "type": "aggroTable" }` | How this unit selects its target when aggro'd. |
| `tactics` | UnitTactics | no | `{ "type": "randomAvailable" }` | How this unit decides which power to use. |
| `onDeath` | string | no | | Name of one of `powers` to fire once when the unit dies, instead of in combat. Tactics never use it. See [On death](#on-death). |
| `stealth` | float | no | | When set, the unit spawns stealthed (and re-stealths whenever it resets), with this stealth rating. See [Stealth](#stealth). |
| `detection` | float | no | `0` | Detection rating, for spotting stealthed characters. Not used yet. |

---

## UnitTargeting

Determines how the unit selects its target once aggro'd.

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | `"aggroTable"`, `"nearest"`, or `"healerAggro"`. |

### aggroTable

Follows the unit's threat table. Players build threat on it by damaging it (1 per point) and by healing (0.5 per point restored, on every engaged NPC on the map). It starts on whoever it first engaged and switches only when another player's threat passes 110% of its current target's. When its target dies it takes the highest-threat player, then falls back to a packmate's target. The table clears on leash and respawn. No additional fields.

### nearest

Switches to the nearest valid player, at most once every 6 seconds. Never retargets mid-cast. No additional fields.

### healerAggro

Switches to the player who has restored the most health to others lately (a total that halves every 10 seconds; overheal and self-healing don't count), once they out-heal its current target by 25%, and at most once every 6 seconds. Keeps its current target while nobody is healing. Use sparingly. No additional fields.

---

## UnitTactics

Determines how the unit decides which power to use each time it acts. Powers are referenced by their `name` field.

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | `"randomAvailable"`, `"rotation"`, `"priorityRotation"`, `"scripted"`, or `"phased"`. |

### randomAvailable

Uses a random power from those the unit can currently afford. No additional fields.

### rotation

Cycles through a fixed list of powers in order, waiting for each to become usable before proceeding.

| Field | Type | Required | Notes |
|---|---|---|---|
| `powers` | array of strings | yes | Power names in rotation order. |

```json
{ "type": "rotation", "powers": ["Slash", "Heavy Strike", "Slash"] }
```

### priorityRotation

Each time the unit acts, uses the earliest power in the list that it can currently afford. Designed for cooldown-based ability sets.

| Field | Type | Required | Notes |
|---|---|---|---|
| `powers` | array of strings | yes | Power names in priority order (highest priority first). |

```json
{ "type": "priorityRotation", "powers": ["Heavy Strike", "Slash"] }
```

### scripted

Uses specific powers at specific times within a repeating window.

| Field | Type | Required | Notes |
|---|---|---|---|
| `duration` | float | yes | Length of the script window in seconds. The script repeats after this duration. |
| `events` | array of ScriptEvent | yes | Powers to use and when to use them. |

**ScriptEvent fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `power` | string | yes | Name of the power to use. |
| `at` | float | yes | Seconds into the script window at which to use it. |

```json
{
  "type": "scripted",
  "duration": 15.0,
  "events": [
    { "power": "Slash", "at": 0.0 },
    { "power": "Heavy Strike", "at": 4.5 },
    { "power": "Slash", "at": 9.0 }
  ]
}
```

### phased

Sequences through a list of phases, each with its own tactics, advancing when a transition condition is met. The last phase runs until combat ends.

| Field | Type | Required | Notes |
|---|---|---|---|
| `phases` | array of Phase | yes | At least two phases. |

**Phase fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `tactics` | UnitTactics | yes | Tactics for this phase. May not be `phased`. |
| `transition` | object | unless last phase | Condition that ends this phase and advances to the next. Either `{ "timeElapsed": float }` (seconds since phase started) or `{ "healthBelow": float }` (fraction of maxHP, 0.0-1.0). |

```json
{
  "type": "phased",
  "phases": [
    {
      "tactics": { "type": "rotation", "powers": ["Slash"] },
      "transition": { "healthBelow": 0.5 }
    },
    {
      "tactics": {
        "type": "scripted",
        "duration": 10.0,
        "events": [
          { "power": "Slash", "at": 0.0 },
          { "power": "Frenzy", "at": 3.0 },
          { "power": "Slash", "at": 6.0 }
        ]
      }
    }
  ]
}
```

## On death

`onDeath` names one of the unit's `powers`. That power fires once, the tick
the unit dies, from where it died: no cost, cooldown, cast time or GCD, and
its tactics never pick it while the unit is alive (a tactics entry naming it
is a validation error).

Its effects resolve like any NPC power's, with the dead unit as the caster:

| `affects` | On death |
|---|---|
| `bAll` | Every living player on its map within `range` of the corpse, with line of sight. |
| `bTarget` | Whoever it was fighting when it died, if they're still alive and within `range`. |
| `gAll` / `gTarget` | Its living packmates (units sharing its `groupIdentifier`) within `range`; never itself. |
| `self` | Skipped - the unit is dead. |

Its graphics and sounds play like any other power's, so an explosion,
a burst of spores or a dying curse can be shown on the corpse.

```json
{
  "onDeath": "Last Fuse",
  "powers": [
    {
      "name": "Last Fuse",
      "castTime": null,
      "globalCooldown": 1.0,
      "effects": [
        { "type": "harm", "affects": "bAll", "range": 10.0, "amount": [10.0, 14.0], "school": "magic" }
      ]
    }
  ]
}
```

## Stealth

A unit type with `stealth` spawns stealthed: invisible to players unless they
detect it. Each player detects it through their facing:

- **Rating gap** `d = detection - stealth + elevation gap`, where the elevation
  gap is the character's weighted mean gear elvl minus the map's elvl (see
  [stats.md](../stats.md)). Players have detection 0 for now.
- **Full range** `max(0, 15 + d * 0.5)` feet, and a **faint** band out to 1.6
  times that. Outside the player's front 180 degrees, both are a third as
  long. Within 5 feet it's always fully visible.
- A **faint** unit is drawn at low opacity, a fully seen one half see-through; otherwise they work normally. A unit the
  player doesn't detect isn't drawn and can't be targeted (area effects still
  hit it).

While stealthed it moves at 0.6 times its speed and doesn't body-block. It
drops stealth when it attacks, uses a power, takes damage or aggros, and
re-stealths when it resets.

## Example

```json
{
  "name": "Goblin Raider",
  "description": "A scrappy goblin that bites anything within reach.",
  "tokenImageUrl": [
    "../../assets/tokens/goblin-green.webp",
    "../../assets/tokens/goblin-brown.webp"
  ],
  "tokenRadius": 1.5,
  "speedFactor": 1.2,
  "maxHP": 20,
  "dps": 4.0,
  "attackSpeed": 1.0,
  "resource": {
    "name": "energy",
    "color": "AADD00",
    "max": 100.0,
    "defaultValue": 100.0,
    "returnRate": 10.0,
    "isFluid": true
  },
  "targeting": { "type": "nearest" },
  "tactics": { "type": "rotation", "powers": ["Slash"] },
  "powers": [
    {
      "name": "Slash",
      "description": "A quick slash at the target.",
      "maxRange": 5.0,
      "castTime": null,
      "globalCooldown": 1.0,
      "costType": "energy",
      "costAmount": 40.0,
      "graphicEffects": [
        {
          "sourceURL": "../../assets/interactions/images/slash.webp",
          "duration": 0.2,
          "from": "affected",
          "when": "immediate",
          "condition": "onHit"
        }
      ],
      "soundEffects": [
        {
          "sourceURL": "../../assets/interactions/sounds/slash.mp3",
          "duration": 0.2,
          "location": "self",
          "when": "immediate",
          "condition": "always"
        }
      ],
      "effects": [
        {
          "type": "harm",
          "affects": "bTarget",
          "range": 5.0,
          "amount": [2.0, 4.0],
          "tags": ["physical", "melee"]
        }
      ]
    }
  ]
}
```
