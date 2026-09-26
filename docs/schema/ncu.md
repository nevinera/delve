# NCU

A non-combat unit: a character placed on a map that can move around and talk, but never fights. NCUs are defined in the `ncus` array of a Map. Unlike [Units](unit.md), they have no UnitType; everything about them is set inline.

NCUs can't be targeted, attacked, or healed, and never aggro. A player talks to one by right-clicking it within 10 feet of its token.

See [common.md](common.md) for `Position`, and [unit.md](unit.md#unitmovement) for `UnitMovement`.

## Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `identifier` | string | yes | | Unique among the zone's NCUs. |
| `name` | string | yes | | Display name, shown on its token and in its dialogue window. |
| `tokenImageUrl` | string | yes | | Portrait image URL, relative to the file it's written in. |
| `tokenRadius` | float | yes | | Token radius in feet. Range: 1.0-20.0. |
| `speedFactor` | float | no | `1.0` | Movement speed multiplier relative to base character speed. Range: 0.0-10.0. |
| `position` | Position | yes | | Placement location and initial facing direction. |
| `movement` | UnitMovement | no | `{ "type": "still" }` | Same movement types as a unit's. |
| `dialogue` | Dialogue | no | | A branching conversation tree. Without dialogue, an NCU can't be talked to. |

## Dialogue

A branching conversation, entered by right-clicking the NCU. A starting node is picked at random from `entry` each time a conversation starts - a single entry always starts there.

| Field | Type | Required | Notes |
|---|---|---|---|
| `entry` | array of DialogueEntry | yes | At least one candidate starting node. |
| `nodes` | object | yes | Dict of node id -> DialogueNode. At least one entry. |

**DialogueEntry fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `node` | string | yes | A node id (a key into `nodes`). |

`DialogueEntry` is its own object (not a bare node id string) so a future flag-gated `condition` field has somewhere to land without a breaking schema change - not implemented yet.

**DialogueNode fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `text` | string | yes | The line shown for this node. Non-empty. |
| `next` | string | no | Node id to advance to automatically. Mutually exclusive with `choices`. |
| `choices` | array of DialogueChoice | no | Player-facing options, at least one. Mutually exclusive with `next`. |

A node with neither `next` nor `choices` ends the conversation.

**DialogueChoice fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `text` | string | yes | The choice's button label. Non-empty. |
| `next` | string | yes | Node id to advance to. |

## Example

```json
{
  "identifier": "grizzle",
  "name": "Grizzle",
  "tokenImageUrl": "../../tokens/unit/goblin-2.webp",
  "tokenRadius": 2.0,
  "speedFactor": 0.8,
  "position": { "x": 62.0, "y": 12.0, "angle": 180.0 },
  "movement": { "type": "wander", "location": { "x": 62.0, "y": 12.0 }, "radius": 4.0, "speed": 0.3, "waitTime": [4.0, 8.0] },
  "dialogue": {
    "entry": [{ "node": "greeting" }],
    "nodes": {
      "greeting": {
        "text": "Psst. You. Don't go in there.",
        "choices": [
          { "text": "Why not?", "next": "warn-why" },
          { "text": "Fine, goodbye.", "next": "bye" }
        ]
      },
      "warn-why": {
        "text": "There's something in there that doesn't like visitors.",
        "next": "bye"
      },
      "bye": {
        "text": "If anyone asks, you never saw me."
      }
    }
  }
}
```
