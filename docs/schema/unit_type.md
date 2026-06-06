# UnitType

A UnitType is a template from which individual units are created in a zone.

## Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | yes | | Display name. |
| `description` | string | no | | Short description shown in UI. |
| `tokenImageUrl` | string \| array of strings | yes | | Portrait image URL(s). If an array, one is chosen at random each time a unit is created from this type. |
| `tokenRadius` | float | yes | | Token radius in feet. Range: 1.0–20.0. |
| `speedFactor` | float | no | `1.0` | Movement speed multiplier relative to base character speed. Range: 0.0–10.0. |
| `maxHP` | integer | yes | | Maximum hit points. |
| `resource` | ResourceType | yes | | The resource used to power this unit's abilities. |
| `powers` | array of Power \| AssetReference(`referenceTo: "power"`) | no | `[]` | Powers available to this unit. Inline Power objects or references to external power files. A unit_type containing any AssetReferences is abstract (see [common.md](common.md)). |
| `targeting` | UnitTargeting | no | `{ "type": "aggroTable" }` | How this unit selects its target when aggro'd. |
| `tactics` | UnitTactics | no | `{ "type": "randomAvailable" }` | How this unit decides which power to use. |

---

## UnitTargeting

Determines how the unit selects its target once aggro'd.

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | `"aggroTable"`, `"nearest"`, or `"healerAggro"`. |

### aggroTable

Targets the unit at the top of the threat table (standard MMO behavior). No additional fields.

### nearest

Targets the nearest valid enemy. No additional fields.

### healerAggro

Targets whoever is contributing the most healing to enemies. Use sparingly. No additional fields.

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
| `transition` | object | unless last phase | Condition that ends this phase and advances to the next. Either `{ "timeElapsed": float }` (seconds since phase started) or `{ "healthBelow": float }` (fraction of maxHP, 0.0–1.0). |

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
