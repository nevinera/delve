# Quest

A task a player accepts from an NCU, completes by meeting its objectives, and optionally turns in to an NCU for rewards. Quests are defined in a world's quests file (see `questsPath` in [World](world.md)), and may reference NCUs and items in any zone of that world.

## Quests file

A JSON array of Quest objects. Order has no meaning; editors keep it sorted by `chainIdentifier`, then `identifier`, to reduce merge conflicts. Validation does not enforce the order.

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `identifier` | string | yes | Unique among the world's quests. |
| `name` | string | yes | Short title, shown in the quest log. |
| `chainIdentifier` | string | yes | Groups related quests into a chain. Display grouping only; sequencing comes from flags. |
| `chainName` | string | yes | Display name for the chain. Same for every quest sharing a `chainIdentifier`. |
| `offeredBy` | NcuRef | yes | The NCU that offers the quest. |
| `turnIn` | NcuRef | no | The NCU the quest is turned in to. Without one, the quest completes wherever its objectives are met. |
| `description` | string | no | Quest log text. Defaults to `<NCU name> said: <offerText>`. |
| `offerText` | string | yes | What the offering NCU says when offering the quest. |
| `progressText` | string | no | What the turn-in NCU says while the quest is incomplete. |
| `completionText` | string | no | What the turn-in NCU says on completion. |
| `requiresFlags` | array of strings | no | Flags the character must have to be offered the quest. |
| `grantsFlags` | array of strings | no | Flags set on completion. |
| `timer` | string | no | Time limit in in-game time, like `"124s"` or `"5m"`. Max `"60m"`. Running out fails the quest. |
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

Every objective has a `type`; its other fields depend on the type.

| Type | Meaning |
|---|---|
| `talk` | Talk to an NCU. |
| `kill` | Kill some number of a unit type. |
| `reach` | Enter a map. |

No two objectives in one quest may be identical. Progress is tracked per objective by its content, which is what lets it carry over to a new world version (see [Quests](../quests.md#world-versions)).

A `talk` objective and `turnIn` are independent, and may name the same NCU (talk first for a full dialogue tree, then turn in).

**`talk` fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `zone` | string | yes | Zone defining the NCU. |
| `ncu` | string | yes | NCU identifier within that zone. |

**`kill` fields:**

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `zone` | string | yes | | Zone defining the unit or unit type. |
| `unit` | string | no | | A specific unit's identifier (unique within the zone). Exactly one of `unit` or `unitType` is required. |
| `unitType` | string | no | | A unit type identifier; any unit of that type counts. |
| `count` | integer | no | `1` | Number of kills required. |
| `map` | string | no | | Only count kills on this map. |

**`reach` fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `zone` | string | yes | Zone identifier. |
| `map` | string | yes | Map identifier within that zone. |

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
    "offerText": "Psst. Clear out those rats and I'll make it worth your while.",
    "progressText": "Still rats down there?",
    "completionText": "Heh. Knew you had it in you.",
    "requiresFlags": ["custom/grizzle-likes-you"],
    "grantsFlags": ["custom/grizzle-trusts-you"],
    "timer": "5m",
    "objectives": [
      { "type": "kill", "zone": "goblin-cave", "unitType": "rat", "count": 5, "map": "gc1-goblin-cave-entrance" }
    ],
    "rewards": [
      { "zone": "goblin-cave", "item": "rusty-dagger" }
    ]
  }
]
```
