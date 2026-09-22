# CharacterClass

A CharacterClass defines the abilities, resources, and appearance of a player character archetype.

See [resource_type.md](resource_type.md) for the `ResourceType` type embedded in `resources`.
See [ability.md](ability.md) for the `Ability` type embedded in `powers`.

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Display name. |
| `description` | string | no | Short description shown in UI. |
| `colors` | Colors | yes | Two display colors used for this class's tokens and UI elements. |
| `resources` | array of ResourceType | yes | Resources available to this class. Most classes have one; some may have multiple. Exactly one entry must set `displayType: "primary"` (see [resource_type.md](resource_type.md)) - that's the one displayed, regenerated, and spent by ability costs. |
| `powers` | array of Ability \| AssetReference(`referenceTo: "ability"`) | no | Abilities available to this class. Inline Ability objects or references to external ability files. A class containing any AssetReferences is abstract (see [common.md](common.md)). |
| `primaryStats` | array of string | yes | One or more of `strength`, `agility`, `intellect`, no duplicates. Hybrid classes may list more than one. Used to synthesize Trainee Gear (see [stats.md](../stats.md)) for this class's empty equipment slots. |
| `secondaryStats` | array of string | yes | Exactly 5 secondary stats, ranked highest to lowest priority, no duplicates. Each must be one of `stamina`, `crit_rating`, `haste_rating`, `mastery_rating`, `versatility_rating`, `defence_rating`, `recovery_rating`. Used alongside `primaryStat` to synthesize Trainee Gear. |
| `wields` | array of string | yes | 1-2 entries, each one of `axe`, `sword`, `staff`, `wand`, `dagger`, `shield`, `totem`, `book`, `spear`, `bow`, `crossbow`, `gun`, `orb`. A single entry is two-handed. Two entries put the first in `main_hand` and the second in `off_hand`. Only used to pick weapon types for Trainee Gear (see [stats.md](../stats.md)) — weapon-type restrictions on real items aren't implemented yet. |

---

## Colors

Two display colors for this class, used for token rendering and UI theming.

| Field | Type | Required | Notes |
|---|---|---|---|
| `major` | Color | yes | Primary color (see [common.md](common.md#color)). |
| `minor` | Color | yes | Secondary color (see [common.md](common.md#color)). |

```json
{ "major": "1144CC", "minor": "88AAFF" }
```

---

## Example

```json
{
  "name": "Warrior",
  "description": "A heavily armored melee fighter.",
  "colors": { "major": "AA2200", "minor": "FFCC88" },
  "primaryStats": ["strength"],
  "secondaryStats": ["mastery_rating", "haste_rating", "crit_rating", "versatility_rating", "stamina"],
  "wields": ["sword", "shield"],
  "resources": [
    {
      "name": "rage",
      "color": "CC2200",
      "max": 100.0,
      "defaultValue": 0.0,
      "returnRate": 5.0,
      "isFluid": true,
      "displayType": "primary"
    }
  ],
  "powers": [
    {
      "name": "Strike",
      "description": "A basic melee attack.",
      "castTime": null,
      "globalCooldown": 1.5,
      "costType": "rage",
      "costAmount": 20.0,
      "effects": [
        {
          "type": "harm",
          "affects": "bTarget",
          "range": 5.0,
          "amount": [8.0, 12.0],
          "tags": ["physical", "melee"]
        }
      ]
    }
  ]
}
```
