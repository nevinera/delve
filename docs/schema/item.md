# Item

An Item is a piece of equipment that can be awarded to a character from a zone's loot table.

Items are defined in the zone config and sent to the Rails app by the game server when a character receives one. The `identifier` must be unique within the zone.

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `identifier` | string | yes | Slug unique within this zone. Used to deduplicate awards - a character can only hold one item per `identifier` per zone version. |
| `name` | string | yes | Display name. |
| `slot` | string | yes | Equipment slot type. See valid values below. |
| `ilvl` | integer | yes | Item level. Must be at least 0. |
| `description` | string | no | Flavour text shown in the item tooltip. |
| `icon_url` | string | no | URL of the item icon image. |
| `stats` | object | no | Stat bonuses granted by this item. See stat fields below. Omitted stats grant nothing. |

---

## Slot Values

| Value | Slot |
|---|---|
| `head` | Helm |
| `neck` | Necklace |
| `shoulders` | Shoulders |
| `back` | Cloak |
| `chest` | Chest |
| `wrists` | Bracers |
| `hands` | Gloves |
| `waist` | Belt |
| `legs` | Legs |
| `feet` | Boots |
| `ring` | Either ring slot |
| `trinket` | Either trinket slot |
| `main_hand` | Main-hand weapon |
| `off_hand` | Off-hand weapon or shield |
| `one_hand` | Can go in main-hand or off-hand |
| `two_hand` | Uses both hands |

---

## Stats Object

All stat fields are optional and default to zero when absent. Integer stats must be non-negative.

| Field | Type | Notes |
|---|---|---|
| `strength` | integer | Physical damage and melee power. |
| `agility` | integer | Attack speed and dodge chance. |
| `intellect` | integer | Spell power and mana. |
| `stamina` | integer | Maximum HP. |
| `crit_rating` | integer | Critical strike chance. |
| `haste_rating` | integer | Cooldown and cast speed reduction. |
| `mastery_rating` | integer | Class-specific mastery bonus. |
| `versatility_rating` | integer | Damage done and damage taken reduction. |
| `resilience_rating` | integer | PvP damage reduction. |
| `weapon_dps` | float | Weapon damage per second. Only meaningful on `main_hand` and `off_hand` items; must be greater than 0 if present. |

---

## Example

```json
{
  "identifier": "sword-of-doom",
  "name": "Sword of Doom",
  "slot": "main_hand",
  "ilvl": 584,
  "description": "Forged in the fires of an ancient volcano.",
  "icon_url": "../../assets/items/sword-of-doom.webp",
  "stats": {
    "strength": 120,
    "stamina": 80,
    "crit_rating": 45,
    "weapon_dps": 312.50
  }
}
```
