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
| `powers` | array of Power | no | `[]` | Powers available to this unit. |

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
