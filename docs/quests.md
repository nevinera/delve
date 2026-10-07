# Quests

A quest is a task a player accepts, usually from an NCU. It has zero or more objectives, all of
which must be met, and may name an NCU to turn it in to. Completing a quest can grant flags and
item rewards. Quests can have a time limit (in-game time, up to 60 minutes); running out fails the
quest. Any quest can be abandoned. Failing or abandoning a quest has no lasting effect, and the
player can pick it up again. A character can have up to 20 active quests per world.

Schemas: [Quest](schema/quest.md), and `questsPath` in [World](schema/world.md). All of a world's quests
live in one quests file.

## Objective types

- **talk**: talk to a specific NCU. Starting any conversation with it counts.
- **kill**: kill a number of units of a unit type, or one specific unit (a named mob), optionally
  only on one map.
- **reach**: enter a specific map.

A quest with no objectives is a breadcrumb: it exists to send the player to its turn-in NCU.

## Flags

Quests gate and reward with [flags](flags.md). A quest lists the flags a character needs before
it's offered (`requiresFlags`), and the flags it grants on completion (`grantsFlags`). Every quest
also grants `quest/completed/<identifier>` when completed, without listing it.

That flag is the only record of a completed quest. Nothing records failed or abandoned quests.

## World versions

Quest definitions live in the world's content, so a new world version can change them. When a
character moves to a new version, their active quests move with it:

- A quest that no longer exists is dropped.
- Progress is kept for each objective that exists unchanged in the new version. Any change to an
  objective, even just its `count`, starts that objective over.

## Quest chains

Quests that share a `chainIdentifier` form a chain, displayed together under their `chainName`. A
chain is only a display grouping: sequencing comes entirely from flags, with a follow-up quest
requiring the earlier quest's completion flag. That makes several shapes fall out naturally:

- **Linear**: B requires A's completion flag, C requires B's.
- **Parallel steps**: C requires both A's and B's completion flags, so A and B can be done in
  any order.
- **Chained chains**: the first quest in one chain requires a flag (or a completion flag) from a
  quest in another chain.

Flags are the only link between quests, so the schema never implies requirements. Editors may fill
in the usual completion-flag requirements for authors.

## Offers

An NCU offers a quest to a character who isn't on it, hasn't completed it, and holds every flag
in its `requiresFlags`. The game server works out each player's offers on connecting, after they
talk to an NCU, and after they accept a quest. An NCU with a quest for the player shows a pale
blue diamond over its token, and its quests are listed at the top of its conversation (an NCU
with quests but no dialogue can still be talked to). Accepting goes through the game server,
which checks the offer again.

## Quest log

The quest log (default key `J`) lists a player's active quests grouped by chain, with each quest's
description (or `<NCU name> said: <offerText>`), its objectives' progress, and the time left on
a timed quest. The client keeps the log itself: it reads the active quests from Rails on load,
then applies the game server's events (`quest-received`, `quest-updated`, `quest-progress`,
`quest-completed`, `quest-failed`, `quest-abandoned`). Names and texts come from the quests file.
Abandoning a quest from the log goes through the game server.

## Progress and completion

The game server tracks objectives in the zone the player is in: `talk` when they start a
conversation with the NCU, `kill` when a matching unit they tagged (damaged first) dies, and
`reach` when they arrive on the map. Each step is saved to Rails as it happens.

A quest with no `turnIn` completes as soon as every objective is met. One with a `turnIn` is
listed in that NCU's conversation: its `progressText` until it's finished, then its
`completionText` and a Complete button. Completing grants `quest/completed/<identifier>`, the
quest's `grantsFlags` and its rewards, and can open up new offers.

A timed quest fails when its timer runs out. Its timer runs only while the character is
connected to a zone in the world; the game server saves it every 15 seconds and on disconnect.

## State

Rails stores only active quests. Rails never reads the quests file outside import: the game
server supplies a quest's definition when it's accepted, and a newer one when the world version
changes.

- **`CharacterQuest`:** the quest's structure (`chainIdentifier`, `offeredBy`, `turnIn`, flags,
  `timer`, `rewards`), the world version that definition is from, and the timer's elapsed
  seconds. No prose: names and texts stay in the quests file.
- **`QuestProgress`:** one per objective: its definition, its position, its count, and its hash
  (`QuestObjective.hash_of`), which identifies it across versions.

The game server counts the timer and saves it (see
[Progress and completion](#progress-and-completion)).

When a character joins a zone with a quest from an older world version, the game server syncs it
to the new definition, or abandons it if the new version doesn't have it (see
[World versions](#world-versions)).

## Endpoints

| Endpoint | For | Does |
|---|---|---|
| `GET /play/characters/:id/worlds/:world_id/quests` | Client | Active quests. |
| `GET /internal_api/world_characters/:id/quests` | Game server | Active quests. |
| `POST /internal_api/world_characters/:id/quests` `{quest: definition}` | Game server | Accepts it. Idempotent; 422 if completed, or 20 are active. |
| `POST /internal_api/world_characters/:id/quests/:quest/sync` `{quest: definition}` | Game server | Moves it to a newer definition, keeping progress on unchanged objectives. |
| `PATCH /internal_api/world_characters/:id/quests/:quest` `{progress: {hash: count}, timer_elapsed_seconds}` | Game server | Sets progress and the timer (absolute values). |
| `POST /internal_api/world_characters/:id/quests/:quest/complete` | Game server | Grants `quest/completed/<quest>`, the stored `grantsFlags` and rewards; ends the quest. Returns `{flags, items: [{identifier, name}]}` (items newly held). |
| `DELETE /internal_api/world_characters/:id/quests/:quest` | Game server | Fails or abandons it. Idempotent. |

Each quest is `{quest_identifier, world_version_id, timer_elapsed_seconds, definition,
objectives: [{hash, objective, count, required}]}`. The game server owns the rules
(requirements, objectives, timers); Rails only checks the 20-quest cap and that a quest isn't
already completed.
