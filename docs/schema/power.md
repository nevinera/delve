# Power

A Power is an active ability a unit can use in combat.

## Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | yes | | Display name. |
| `description` | string | no | | Short description shown in UI. |
| `maxRange` | float | no | | Maximum range in feet to a valid target. Omit for self-only or melee powers. |
| `castTime` | float \| null | yes | | Cast duration in seconds. `null` means instant. |
| `globalCooldown` | float | yes | | Seconds before the unit can use any power again after this one. |
| `costType` | string | no | | Name of the resource required to use this power. Must match the unit's resource `name`. |
| `costAmount` | float | no | | Amount of the resource that must be available. The power cannot be used if the unit has less than this. |
| `graphicEffects` | array of GraphicEffect | no | `[]` | Visual effects played when this power fires. |
| `soundEffects` | array of SoundEffect | no | `[]` | Audio effects played when this power fires. |
| `effects` | array of PowerEffect | yes | | Mechanical effects applied on use. May be empty. |

## Example

```json
{
  "name": "Bite",
  "description": "Hurts the target. With teeth.",
  "maxRange": 5.0,
  "castTime": null,
  "globalCooldown": 1.0,
  "graphicEffects": [
    {
      "sourceURL": "../../assets/interactions/images/bite.webp",
      "duration": 0.2,
      "from": "affected",
      "when": "immediate",
      "condition": "onHit"
    }
  ],
  "soundEffects": [
    {
      "sourceURL": "../../assets/interactions/sounds/bite.mp3",
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
```
