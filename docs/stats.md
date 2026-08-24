# Stats and Equipment

## Elevation

*Elevation* (`elvl`) is a single scale used for both places (zones/maps) and items. A monster's
elevation is the elevation of the map it's in. An item's elevation is set when it's authored/dropped.

A zone/map's elevation describes the level of gear that it *rewards*; a zone should generally not be
attempted unless one has an average gear elevaation within 12 of the zone.

| Zone elvl (relative) | Feel |
|---|---|
| -20 | Implausible: bosses one-shot characters, constant deaths/wipes |
| -10 | Dangerous, but doable: needs careful pulls, CC, some wipes |
| +0 | Straightforward: can skip CC, smooth runs with chain-pulling, rare wipes |
| +10 | Easy: multipulls, dungeon sprinting, soloing plausible for some |
| +20 | Trivial: enemies can barely hurt you, you one-shot many of them |

The intent is an automatically-scaled experience: a zone at (clvl + 10) should feel like
running an old-school (BC-era WoW) dungeon in quest greens; on-level should feel like heroics in
heroic gear; +10 should feel like taking raid epics back to do dungeons again.

### Item coloration

An item's display color is driven by the player's current (weighted) mean elvl versus the item's
elvl delta:

| Delta | Color |
|---|---|
| up to -15 | Gray |
| up to -5 | Green |
| up to +5 | Blue |
| up to +15 | Purple |
| above +15 | Orange |

## Effective elevation and the elevation multiplier

Every stat an item grants is scaled by how far the item's elvl sits from the elvl it's being used
at. The input to that scaling is **effective elevation (ee)**: `ee = item elvl - map elvl`. `ee = 0`
is "on-level", `ee = -10` is "entry-level".

`ee` is fed through a logistic curve to produce the **elevation multiplier (em)** — an internal-only
value, never shown to players:

```
em(ee) = f(ee) * m(ee)

f(ee) = 2 / (1 + 3^(-ee/10))

m(ee) = 1                     for |ee| <= 10
m(ee) = (ee + 20) / 10        for -20 <= ee < -10
m(ee) = 1 + (ee - 10) / 90    for 10 < ee <= 20
m(ee) = 0                     for ee < -20
m(ee) = 10/9                  for ee > 20
```

`f` is the base logistic curve, exactly 0.5/1.0/1.5 at ee = -10/0/10. Outside +/-10, `em` is `f`
multiplied by a linear taper: on the low side the taper runs from 1 (at ee=-10) to 0 (at ee=-20),
forcing `em` to exactly 0; on the high side it runs from 1 (at ee=10) up to 10/9 (at ee=20), which
slightly amplifies `f` so `em` lands exactly on 2 (since `f(20)` alone is only 1.8). Monotonically
increasing throughout.

| ee | em |
|---|---|
| -20 | 0.0 |
| -15 | 0.16 |
| -10 | 0.5 |
| -5 | 0.73 |
| 0 | 1.0 |
| +5 | 1.27 |
| +10 | 1.5 |
| +15 | 1.77 |
| +20 | 2.0 |

At `ee = -20` a character is effectively naked — every attack should take about half their health.
This is intentionally implausible in real play (see the zone table above), but it does create an
edge case in a world's starting zones, where characters genuinely are on-level but have no gear yet.
See **Trainee Gear** below for how that's handled.

The character sheet displays stats assuming `ee = 0` by default, with a toggle to preview them
against the current map's elvl instead. (In the webapp, there's a numeric input where you can
supply the map's elevation to see what your stats will total to)

## Slots

| Slot | Shape |
|---|---|
| Ring (x2) | 2 secondaries |
| Neck | 3 secondaries |
| Shoulders / Back / Waist / Hands / Feet / Wrists | Primary + 2 secondaries |
| Head / Chest / Legs | Primary + 3 secondaries (1.5x factor) |
| Main-hand weapon | Primary + 3 secondaries (2x factor) |
| Two-hand weapon | Primary + 3 secondaries (4x factor) |
| Off-hand weapon or non-weapon | Primary + 3 secondaries (2x factor) |
| Off-hand shield | Doubled Resilience (instead of a primary) + 3 secondaries (2x factor) |

Rings and Neck have no primary stat and no inherent armor/stamina. Weapons and off-hands (including
shields) have no inherent stamina either, but shields carry a 4x armor bonus instead.

There is one equipment slot for each hand: `main_hand` and `off_hand`. A two-handed weapon occupies
`main_hand` and locks `off_hand`. `off_hand` can otherwise hold a one-handed weapon (dual wield), an
off-hand-specific item (tome, totem, etc.), or a shield.

Trinkets are removed entirely as itemized equipment. They'll eventually be replaced by a consumable
equivalent, but that's out of scope here — for now the trinket slots and all trinket items just go
away.

## Stat points

At `em = 1.0` (on-level), a primary stat is worth a base **15 points**, and each secondary is worth
a base **10 points**; the base armor supplied is 25. These bases are then multiplied by the slot's
factor (1x/1.5x/2x/4x, per the table above) and then by `em`.

Each slot has a fixed number of stat "shapes" it can roll (e.g. a chest piece rolls a primary and
three secondaries), but any of those can be left empty. When a stat is omitted, its value doesn't
just disappear — most of it gets redistributed across the stats that remain, so a more focused item
has fewer, larger stats rather than strictly less total value:

- Omitting a **secondary** redistributes 60% of what it would have granted, split evenly across the
  remaining stats.
- Omitting the **primary** redistributes 80% of what it would have granted, split evenly across the
  remaining stats.

Example: a chest piece (primary + 3 secondaries) with no primary and only 2 secondaries listed has
each of those secondaries increased by 70% over their base value. With all 3 secondaries listed but
no primary, each is increased by ~26.7%.

## Stamina and armor

Stamina is itemizable as a secondary stat like any other, but most equipped items also grant a
*base* amount of stamina and armor derived purely from their elvl and slot factor — independent of
whatever stamina is itemized on them. Rings, Neck, weapons, and off-hands (including shields) don't
grant this base stamina/armor; shields get a 4x armor bonus but no stamina.

## Trainee Gear

Any equipment slot without a real item in it is treated as holding a generated "Trainee Gear" item
for that slot, rather than being empty. These aren't real items — they're synthesized at runtime
from the character's class. Each class specifies a primary stat and then a ranked list of five
secondary stats; the generated gear will have some of each of those, and has an elvl of 0. Two
characters of the same class always get the same Trainee Gear. The displays them dimmed out,
so it's clear to the player that the character isn't wearing a real item. (The initial zones for
a world should generally be between elevations 0 and 10.)
