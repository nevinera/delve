# Quests

A quest is a task a player accepts from an NCU. It has zero or more objectives, all of which must be
met, and may name an NCU to turn it in to. Completing a quest can grant flags and item rewards.
Quests can have a time limit (in-game time, up to 60 minutes); running out fails the quest. Any
quest can be abandoned. Failing or abandoning a quest has no lasting effect, and the player can pick
it up again.

Schemas: [Quest](schema/quest.md), [QuestChain](schema/quest_chain.md), and `questChains` in
[World](schema/world.md).

## Objective types

- **talk**: talk to a specific NCU.
- **kill**: kill a number of units of a unit type, or one specific unit (a named mob), optionally
  only on one map.
- **reach**: enter a specific map.

A quest with no objectives is a breadcrumb: it exists to send the player to its turn-in NCU.

## Flags

Flags are arbitrary strings set on a character. A quest lists the flags a character needs before
it's offered (`requiresFlags`), and the flags it sets on completion (`grantsFlags`). Every quest
also sets `quest-<identifier>-completed` when completed, without listing it.

## Quest chains

A quest chain is a named, unordered group of quests, stored in its own file and referenced by the
world. Sequencing comes only from flags: a follow-up quest requires the earlier quest's completion
flag. That makes several shapes fall out naturally:

- **Linear**: B requires A's completion flag, C requires B's.
- **Parallel steps**: C requires both A's and B's completion flags, so A and B can be done in
  any order.
- **Chained chains**: the first quest in one chain requires a flag (or a completion flag) from a
  quest in another chain.

Flags are the only link between quests, so the schema never implies requirements. Editors may fill
in the usual completion-flag requirements for authors.
