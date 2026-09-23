# Unit Construction

Proposed vocabulary for tagging UnitTypes by how they're intended to be encountered - so zone
authors and players can tell at a glance what a unit is for and how to fight it. Not yet a schema
field (see [schema/unit_type.md](schema/unit_type.md)); this document is the tag list to implement
against.

Tags are informational, not enforced - nothing stops a unit's actual kit from disagreeing with its
tags. They're for zone design and UI, not game logic.

## Group size to face (`g1`, `g2`, `g3`, `g5`, `g10`, `g20`, ...)

The size of player group this unit is stat-intended for, matching the G*n* notation in
[combat_balance.md](combat_balance.md). A `g5` unit expects a group of 5 to fight it, whether
that's one tough unit or several weaker ones together.

## Own spawn grouping (`solo`, `pair`, `group`, `swarm`)

How many copies of this unit type are meant to show up together, independent of the group size
tag above - this is about the unit's own social structure, not the players facing it.

- `solo` - appears alone
- `pair` - appears in twos
- `group` - appears in threes or fours
- `swarm` - appears in fives or more

## Combat style

- `melee` / `ranged` - whether it fights at range or up close.
- `physical` / `magic` / `hybrid` - what school its damage mostly comes from.

## Role

- `healer` - heals its allies.
- `tough` - tanky; built to absorb damage rather than deal or prevent it.
- `debuff` - applies debuffs to enemies.
- `buff` - buffs its allies (not just itself).
- `interrupt` - interrupts enemy casts.

## Encounter

- `boss` - a named, set-piece encounter with its own mechanics, independent of group size (a
  solo boss and a solo trash mob play very differently).
- `minion` - accompanies a boss encounter, rather than being the main threat.
- `burst` - has a big telegraphed hit that must be avoided or healed through, rather than dealing
  steady sustained damage.

## Mobility

- `stationary` - can't be kited or repositioned (turrets, totems, plants). Mobile is the default
  and untagged.

## Deferred

Tags for mechanics the game doesn't support yet, to add once they exist:

- `cc` - applies hard crowd control (stun/root/silence/fear).
- `summoner` - spawns adds/reinforcements mid-fight.
