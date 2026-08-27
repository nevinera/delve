# Item

An Item is a piece of equipment that can be awarded to a character from a zone's loot table.

Items are defined in the zone config and sent to the Rails app by the game server when a character receives one. The `identifier` must be unique within the zone.

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `identifier` | string | yes | Slug unique within this zone. Used to deduplicate awards - a character can only hold one item per `identifier` per zone version. |
| `name` | string | yes | Display name. |
| `slot` | string | yes | Equipment slot type. See valid values below. |
| `elvl` | integer | yes | Elevation. See [stats.md](../stats.md). Must be at least 0. |
| `shield` | boolean | no | Only meaningful when `slot` is `off_hand`. `true` makes this a shield: its primary slot is fixed to Defence Rating (at 2.5x) instead of a free choice. Defaults to `false`. |
| `weaponType` | string \| null | no | Set only when this item is an actual weapon. One of the weapon type values below. Determines the character's basic attack. `null` for non-weapon off-hand items (shields, relics like a book/totem/orb) and for all non-weapon slots. |
| `primary` | string \| null | no | Which primary stat this item rolls. One of `strength`, `agility`, `intellect`, or `null` to skip it. Not applicable to `ring`, `neck`, or a `shield` item (always `null` for those - a shield's primary slot is Defence Rating, not a free pick). |
| `secondaries` | array of string | no | Which secondary stats this item rolls, in any order. Values from the secondary stat list below. Length must not exceed the slot's secondary count (see [stats.md](../stats.md) `## Slots`); fewer than the max is allowed and triggers the redistribution bonus. |
| `description` | string | no | Flavour text shown in the item tooltip. |
| `icon_url` | string | no | URL of the item icon image. |

There are no stat *values* on an item - only which stats it rolls. The actual numbers are computed
at runtime from the item's `elvl`, its slot's factor, and the current effective elevation. See
[stats.md](../stats.md) for the full formulas (base points, slot factors, the elevation multiplier,
and the redistribution rule for omitted stats).

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
| `main_hand` | Main-hand weapon |
| `off_hand` | Off-hand weapon, off-hand non-weapon, or shield (see `shield` field) |
| `one_hand` | Can go in main-hand or off-hand |
| `two_hand` | Uses both hands, locks `off_hand` |

---

## Weapon Type Values

Valid entries for `weaponType`. Determines the form of the wielding character's basic attack. Only
actual weapons get a `weaponType` - non-weapon off-hand items (shields, relics like a book/totem/orb)
leave it `null`.

| Value | Notes |
|---|---|
| `axe` | |
| `sword` | |
| `mace` | |
| `dagger` | |
| `fist_weapon` | |
| `polearm` | |
| `staff` | Two-handed. |
| `bow` | Ranged, two-handed. |
| `crossbow` | Ranged, two-handed. |
| `gun` | Ranged, two-handed. |
| `wand` | Ranged. |
| `thrown` | Ranged, off-hand. |

---

## Secondary Stat Values

Valid entries for `secondaries`:

| Value | Notes |
|---|---|
| `stamina` | Maximum HP. Also has a base value granted by elvl on most armor slots, independent of whether it's itemized here; see [stats.md](../stats.md). |
| `crit_rating` | Critical strike chance. |
| `haste_rating` | Attack/cast speed and cooldown reduction. |
| `mastery_rating` | Class-specific mastery bonus. |
| `versatility_rating` | Adds a fraction of itself to each primary stat and to Defence Rating. |
| `defence_rating` | Direct percentage reduction to incoming damage (physical more than magic); see [stats.md](../stats.md). |
| `recovery_rating` | Base resource regen; most resource-recovery powers scale off it. Moderately increases healing taken. |

---

## Example

```json
{
  "identifier": "sword-of-doom",
  "name": "Sword of Doom",
  "slot": "main_hand",
  "weaponType": "sword",
  "elvl": 584,
  "description": "Forged in the fires of an ancient volcano.",
  "icon_url": "../../assets/items/sword-of-doom.webp",
  "primary": "strength",
  "secondaries": ["stamina", "crit_rating", "haste_rating"]
}
```

A shield example - no `primary`, since it's fixed to Defence Rating:

```json
{
  "identifier": "bulwark-of-the-warband",
  "name": "Bulwark of the Warband",
  "slot": "off_hand",
  "shield": true,
  "elvl": 584,
  "secondaries": ["stamina", "defence_rating", "mastery_rating"]
}
```
