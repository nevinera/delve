# QuestChain

A named group of related [Quests](quest.md). The order of `quests` has no meaning: sequencing comes entirely from each quest's `requiresFlags` (usually another quest's `quest-<identifier>-completed` flag). Quest chains are referenced from a [World](world.md)'s `questChains`.

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `identifier` | string | yes | Unique among the world's quest chains. |
| `name` | string | yes | Display name. |
| `quests` | array of Quest | yes | At least one. Unordered. |

## Example

`grizzles-troubles.json`

```json
{
  "identifier": "grizzles-troubles",
  "name": "Grizzle's Troubles",
  "quests": [
    {
      "identifier": "grizzle-warning",
      "world": "demo-core",
      "name": "A Goblin's Warning",
      "offeredBy": { "zone": "goblin-cave", "ncu": "grizzle" },
      "offerText": "Psst. Clear out those rats and come back.",
      "turnIn": { "zone": "goblin-cave", "ncu": "grizzle" },
      "objectives": [
        { "type": "kill", "zone": "goblin-cave", "unitType": "rat", "count": 5 }
      ]
    },
    {
      "identifier": "grizzle-deeper",
      "world": "demo-core",
      "name": "Deeper Still",
      "offeredBy": { "zone": "goblin-cave", "ncu": "grizzle" },
      "offerText": "Now go see what's past the rats.",
      "requiresFlags": ["quest-grizzle-warning-completed"],
      "objectives": [
        { "type": "reach", "zone": "goblin-cave", "map": "gc2-goblin-cave-depths" }
      ]
    }
  ]
}
```
