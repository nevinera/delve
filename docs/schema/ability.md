# Ability

An Ability is an active ability a unit or character class can use in
combat. A unit's `powers` and a class's `powers` are both arrays of this
same Ability type - a unit "power" and a class "ability" are the same
schema, just referenced from different places (see [unit_type.md](unit_type.md)
and [character_class.md](character_class.md)).

## Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | yes | | Display name. |
| `description` | string | no | | Short description shown in UI. |
| `maxRange` | float | no | | Maximum range in feet to a valid target. Omit for self-only or melee abilities. |
| `speed` | float | no | | Projectile travel speed in feet/sec. When present, `when: "impact"` effects are delayed until the projectile reaches the target (`distance / speed`), and a traveling (`from` != `to`) `when: "immediate"` graphic's `duration` is overridden to match that arrival time. Omit for instant-hit abilities. Client-only; ignored by the game server. |
| `castTime` | float \| null | yes | | Cast duration in seconds. `null` means instant. |
| `globalCooldown` | float | yes | | Seconds before the unit can use any ability again after this one. |
| `cooldown` | float | no | | Per-ability cooldown in seconds. The unit cannot use this specific ability again until this duration has elapsed. |
| `frontal` | boolean | no | `true` | If `true`, the caster must be facing the target within a 150° arc (±75°) to use this ability. Set to `false` for abilities that work regardless of facing. |
| `costType` | string | no | | Name of the resource required to use this ability. Must match the unit's resource `name`. |
| `costAmount` | float | no | | Amount of the resource that must be available. The ability cannot be used if the unit has less than this. |
| `iconURL` | string | no | | URL of the action bar icon image. **Only meaningful when the ability is used by a class** - units don't have an action bar, so `iconURL` on a unit's power is stored but never displayed. Client-only; ignored by the game server. |
| `tags` | array of string | no | | Free-form labels (max 24, each ≤16 characters) for categorizing the ability, e.g. `"harmful"`, `"beneficial"`, `"class_druid"`. |
| `graphicEffects` | array of GraphicEffect | no | `[]` | Visual effects played when this ability fires. Client-only; ignored by the game server. |
| `soundEffects` | array of SoundEffect | no | `[]` | Audio effects played when this ability fires. Client-only; ignored by the game server. |
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
