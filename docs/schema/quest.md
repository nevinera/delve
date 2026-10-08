# Quest

A task a player takes on by talking to an NCU, completes by meeting its objectives, and optionally turns in to an NCU for rewards. Quests are defined in a world's quests file (see `questsPath` in [World](world.md)), and may reference NCUs and items in any zone of that world.

## Quests file

A JSON array of Quest objects. Importing a world version validates it, and checks that every zone, NCU, map, unit, unit type and item it names exists in the world. Order has no meaning; editors keep it sorted by `chainIdentifier`, then `identifier`, to reduce merge conflicts. Validation does not enforce the order.

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `identifier` | string | yes | Unique among the world's quests. 1-54 letters, digits, `_` or `-` (so its completion flag is a valid flag). |
| `name` | string | yes | Short title, shown in the quest log. |
| `chainIdentifier` | string | yes | Groups related quests into a chain. Display grouping only; sequencing comes from flags. |
| `chainName` | string | yes | Display name for the chain. Must be the same for every quest sharing a `chainIdentifier`. |
| `offeredBy` | NcuRef | yes | The NCU that offers the quest. |
| `turnIn` | NcuRef | no | The NCU the quest is turned in to. Without one, the quest completes wherever its objectives are met. |
| `offerText` | string | yes | The dialogue option that starts the quest: a short line the player says to the offering NCU. |
| `description` | string | yes | The offering NCU's reply when the quest starts, also shown in the quest log. |
| `marker` | boolean | no | Default `false`. When `true`, the offering NCU shows a quest marker while the quest is on offer, and its dialogue option shows the same marker. Otherwise the dialogue is the only hint. |
| `progressText` | string | no | What the turn-in NCU says while the quest is incomplete. |
| `completionText` | string | no | What the turn-in NCU says on completion. |
| `requiresFlags` | array of strings | no | Flags the character must have to be offered the quest. |
| `grantsFlags` | array of strings | no | Flags set on completion. No `quest/` flags: those come only from completing quests. |
| `timer` | string | no | Time limit in in-game time: a positive whole number of seconds or minutes, like `"124s"` or `"5m"`. Max `"60m"`. Running out fails the quest. |
| `objectives` | array of Objective | no | All must be met to complete the quest. |
| `rewards` | array of Reward | no | Items granted on completion. |

A quest must have at least one objective or a `turnIn` (zero objectives plus a `turnIn` is a breadcrumb quest).

**Flags:** `requiresFlags` and `grantsFlags` hold [flags](../flags.md) (`<type>/<identifier>`). Completing a quest always grants `quest/completed/<identifier>`, which is never listed in `grantsFlags`. No other flags are implied: a quest that follows another must list that quest's completion flag in `requiresFlags` itself.

Failing (for example, timer expiry) or abandoning a quest sets no flags; the player can re-acquire it.

**NcuRef fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `zone` | string | yes | Zone identifier, within the quest's world. |
| `ncu` | string | yes | NCU identifier within that zone. |

**Reward fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `zone` | string | yes | Zone identifier defining the item. |
| `item` | string | yes | Item identifier within that zone. |

## Objective

Every objective has a `type`, `text`, and a `zone`, and may name a `map` in that zone; its other fields depend on the type.

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | `talk`, `kill` or `reach` (below). |
| `text` | string | yes | What the quest log shows for the objective, like `"Kill 5 rats in the cellar"`. Never generated. |
| `zone` | string | yes | Zone identifier, within the quest's world. The quest log lists the objective under this zone. |
| `map` | string | no | Map identifier within that zone. What it means depends on the type. |

No two objectives in one quest may have the same content (every field but `text`). Progress is tracked per objective by its content, which is what lets it carry over to a new world version (see [Quests](../quests.md#world-versions)); rewording `text` keeps progress.

A `talk` objective and `turnIn` are independent, and may name the same NCU (talk first for a full dialogue tree, then turn in).

**`talk`:** talk to an NCU.

| Field | Type | Required | Notes |
|---|---|---|---|
| `ncu` | string | yes | NCU identifier within the zone. With `map`, the NCU must be on that map. |

**`kill`:** kill some number of a unit or unit type. With `map`, only kills on that map count.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `unit` | string | no | | A specific unit's identifier (unique within the zone). Exactly one of `unit` or `unitType` is required. With `map`, the unit must be on that map. |
| `unitType` | string | no | | A unit type identifier; any unit of that type counts. |
| `count` | integer | no | `1` | Number of kills required. At least 1. |

Every player who can loot the unit gets credit for the kill.

**`reach`:** enter the zone, or with `map`, that map. Arriving or spawning there both count.

## Example

```json
[
  {
    "identifier": "grizzle-warning",
    "name": "A Goblin's Warning",
    "chainIdentifier": "grizzles-troubles",
    "chainName": "Grizzle's Troubles",
    "offeredBy": { "zone": "goblin-cave", "ncu": "grizzle" },
    "turnIn": { "zone": "goblin-cave", "ncu": "grizzle" },
    "offerText": "Got any work for me?",
    "description": "Psst. Clear out those rats and I'll make it worth your while.",
    "marker": true,
    "progressText": "Still rats down there?",
    "completionText": "Heh. Knew you had it in you.",
    "requiresFlags": ["custom/grizzle-likes-you"],
    "grantsFlags": ["custom/grizzle-trusts-you"],
    "timer": "5m",
    "objectives": [
      { "type": "kill", "text": "Kill 5 rats at the cave entrance", "zone": "goblin-cave", "unitType": "rat", "count": 5, "map": "gc1-goblin-cave-entrance" }
    ],
    "rewards": [
      { "zone": "goblin-cave", "item": "rusty-dagger" }
    ]
  }
]
```
