# CharacterClass

A CharacterClass defines the abilities, resources, and appearance of a player character archetype.

See [resource_type.md](resource_type.md) for the `ResourceType` type embedded in `resources`.
See [power.md](power.md) for the `Power` type embedded in `powers`.

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Display name. |
| `description` | string | no | Short description shown in UI. |
| `colors` | Colors | yes | Two display colors used for this class's tokens and UI elements. |
| `resources` | array of ResourceType | no | Resources available to this class. Most classes have one; some may have multiple. |
| `powers` | array of Power \| AssetReference(`referenceTo: "power"`) | no | Powers available to this class. Inline Power objects or references to external power files. A class containing any AssetReferences is abstract (see [common.md](common.md)). |

---

## Colors

Two display colors for this class, used for token rendering and UI theming.

| Field | Type | Required | Notes |
|---|---|---|---|
| `major` | string | yes | Primary color as a 6-digit hex string (no leading `#`). |
| `minor` | string | yes | Secondary color as a 6-digit hex string (no leading `#`). |

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
  "resources": [
    {
      "name": "rage",
      "color": "CC2200",
      "max": 100.0,
      "defaultValue": 0.0,
      "returnRate": 5.0,
      "isFluid": true
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
