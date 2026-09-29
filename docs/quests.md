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
