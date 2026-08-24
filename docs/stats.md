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
| Off-hand shield | 2.5x Defence Rating (instead of a primary) + 3 secondaries (2x factor) |

Rings and Neck have no primary stat and no inherent stamina. Weapons and off-hands (including
shields) have no inherent stamina either.

There is one equipment slot for each hand: `main_hand` and `off_hand`. A two-handed weapon occupies
`main_hand` and locks `off_hand`. `off_hand` can otherwise hold a one-handed weapon (dual wield), an
off-hand-specific item (tome, totem, etc.), or a shield.

Trinkets are removed entirely as itemized equipment. They'll eventually be replaced by a consumable
equivalent, but that's out of scope here — for now the trinket slots and all trinket items just go
away.

## Stat points

At `em = 1.0` (on-level), a primary stat is worth a base **15 points**, and each secondary is worth
a base **10 points**. These bases are then multiplied by the slot's factor (1x/1.5x/2x/4x, per the
table above) and then by `em`.

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

## Strength

There's no separate Attack Power stat. Whichever primary stat a class calls its damage stat (e.g.
Strength for physical-damage classes) feeds directly into weapon damage:

```
SwingDamage = BaseWeaponDamage + (Strength / 7) * NominalSwingSpeed
```

`NominalSwingSpeed` is the weapon's base swing timer - haste changes how often you swing, not this
per-swing damage calculation. `Strength / 7` is a placeholder conversion, easy to retune later.
This mirrors modern WoW, where Strength's only effect (for physical classes) is Attack Power - it
no longer grants block value or anything else.

Strength also grants Parry chance, at half Strength's normal weight - see **Avoidance** below.

## Agility

Agility works like Strength, but at half the damage rate (mirroring WoW, where Strength gives 2 AP
per point and Agility gives 1):

```
SwingDamage = BaseWeaponDamage + (Agility / 14) * NominalSwingSpeed
```

Agility also feeds Crit Rating and Dodge chance directly - it does double (technically triple)
duty, which is why its damage rate is halved:

```
EffectivePhysicalCritRating += Agility * 0.6
```

(Intellect will do the same for magic crit, once we get there.)

## Intellect

Intellect feeds spell damage and magic crit, at the same rates as the other primary stats. It
doesn't grant any avoidance:

```
SpellDamage = BaseSpellDamage + (Intellect / 14) * NominalCastTime
EffectiveMagicCritRating += Intellect * 0.6
```

Instead, Intellect grows the character's resource pool (mana, energy, etc. - whichever their class
uses; the mapping from Intellect to that resource is class-specific, not a universal "mana"):

```
ResourcePool = Intellect * 10
```

## Avoidance

Agility and Strength each also grant a chance to avoid an attack outright - Dodge for Agility,
Parry for Strength:

```
DodgeRate = 0.6 * Agility / (Agility + 250)
ParryRate = 0.6 * Strength / (Strength + 250)
```

Both asymptote toward 60% as the stat grows, hit ~26% at "full" investment in that stat (~194
points, the same order of magnitude a fully-itemized primary stat reaches), and ~13% at half that
(e.g. the same character at `ee = -10`).

Dodge and Parry don't add together, but stack like independent chances, which is worse
than dumping the same points into one:

```
TotalAvoidance = DodgeRate + ParryRate * (1 - DodgeRate)
```

## Stamina

Stamina is itemizable as a secondary stat like any other, but most equipped items also grant a
*base* amount of stamina derived purely from their elvl and slot factor — independent of whatever
stamina is itemized on them. Rings, Neck, weapons, and off-hands (including shields) don't grant
this base stamina. Stamina doesn't get an inherent bonus for being alive either - a character with
no gear has 0 Stamina.

Stamina feeds max HP, which does have its own flat base - a character at `ee = -20` (where `em = 0`
zeroes out all gear-derived Stamina) sits at exactly that base, effectively naked:

```
MaxHP = 100 + Stamina * 10
```

## Crit Rating

Crit Rating (physical or magic, whichever Agility/Intellect fed into it - see above) grants a flat
chance to critically strike, on top of a 5% base. No asymptote - it's just linear - but the rate is
chosen so even a maximally crit-stacked character (full Crit Rating itemization plus full primary
stat contribution) stays well under 100%:

```
CritChance% = 5 + EffectiveCritRating / 15
```

## Haste Rating

Haste Rating grants attack/cast speed, applied multiplicatively (not additively) to shrink swing
timers, cast times, and channel durations, mirroring WoW. Unlike Crit, there's no base amount -
0 Haste Rating means 0% haste:

```
Haste% = HasteRating / 11.71
```

A fully-itemized Haste build (445 Haste Rating) lands at 38% at `ee = 0`, and 19% at `ee = -10`
(half the secondary pool, so exactly half the Haste%, since this formula has no base to break that
proportionality).

## Mastery

Mastery Rating converts to a plain **Mastery** value ranging from 10 (0 rating) up to an asymptote
of 100:

```
Mastery = 10 + 90 * MasteryRating / (MasteryRating + 556.25)
```

A fully-itemized Mastery build (445 Mastery Rating, `ee = 0`) lands at 50.

Mastery itself has no effect in isolation - it's meant purely as an input for class-specific
abilities and passives to scale off of.

## Versatility

Versatility doesn't have its own effect - it adds a fraction of itself to each primary stat and to
Defence Rating instead, at the same rate for every class:

```
Strength      += VersatilityRating * 0.2
Agility       += VersatilityRating * 0.2
Intellect     += VersatilityRating * 0.2
DefenceRating += VersatilityRating * 0.2
```

A fully-itemized Versatility build (445 rating) adds +89 to each of those four - noticeably weaker
than committing those points directly to any one of them, but it touches damage/healing (via
whichever primary a class actually uses), Crit/Dodge/Parry (from the off-primaries, which always
apply regardless of class), and Defence all at once. This is also why tanks have real stat
contention between Mastery, Defence Rating, and Versatility, rather than being able to itemize
everything into pure survivability.

## Defence Rating and damage reduction

There's no separate Armor stat. Instead, **Defence Rating** grants a direct percentage reduction to
incoming damage — a larger reduction against physical damage than against magic:

```
PhysicalDR(r) = 0.9 * r / (r + 98)
MagicDR(r)    = 0.4 * PhysicalDR(r) = 0.36 * r / (r + 98)
```

Where `r` is total Defence Rating. This asymptotes toward 90% physical / 36% magic reduction as `r`
grows, and gives 0% reduction at `r = 0`. A fully-itemized tank (every eligible secondary slot on
Defence Rating, wielding a shield) lands around `r = 250`, giving ~65% physical / ~26% magic
reduction; half that (`r = 125`, e.g. the same tank at `ee = -10`) gives ~50% physical / ~20% magic.

## Trainee Gear

Any equipment slot without a real item in it is treated as holding a generated "Trainee Gear" item
for that slot, rather than being empty. These aren't real items — they're synthesized at runtime
from the character's class. Each class specifies a primary stat and then a ranked list of five
secondary stats; the generated gear will have some of each of those, and has an elvl of 0. Two
characters of the same class always get the same Trainee Gear. The displays them dimmed out,
so it's clear to the player that the character isn't wearing a real item. (The initial zones for
a world should generally be between elevations 0 and 10.)

# Examples

## Adam - Strength DPS with a Two-Hander

Two-handed Strength warrior, 13 equipped slots (`off_hand` is locked by the two-hander). 7 pieces
are on-level (ee=0, em=1.0), 3 are at ee=-5 (em=0.73), 3 are at ee=-10 (em=0.5). Every item is fully
itemized (no missing stats, so no redistribution bonus applies). "Raw" is `base x factor`, before
`em` is applied; "Scaled" is after.

| Slot | ee (em) | Allocation | Raw | Scaled | Base Stamina (raw -> scaled) |
|---|---|---|---|---|---|
| Head | 0 (1.0) | Str + Crit + Haste + Stam | Str 22.5, Crit 15, Haste 15, Stam 15 | Str 22.5, Crit 15, Haste 15, Stam 15 | 15 -> 15 |
| Neck | -10 (0.5) | Crit + Mastery + Vers | Crit 10, Mastery 10, Vers 10 | Crit 5, Mastery 5, Vers 5 | n/a |
| Shoulders | -5 (0.73) | Str + Haste + Stam | Str 15, Haste 10, Stam 10 | Str 10.95, Haste 7.3, Stam 7.3 | 10 -> 7.3 |
| Back | -10 (0.5) | Str + Crit + Mastery | Str 15, Crit 10, Mastery 10 | Str 7.5, Crit 5, Mastery 5 | 10 -> 5 |
| Chest | 0 (1.0) | Str + Crit + Haste + Vers | Str 22.5, Crit 15, Haste 15, Vers 15 | Str 22.5, Crit 15, Haste 15, Vers 15 | 15 -> 15 |
| Wrists | -5 (0.73) | Str + Haste + Crit | Str 15, Haste 10, Crit 10 | Str 10.95, Haste 7.3, Crit 7.3 | 10 -> 7.3 |
| Hands | -10 (0.5) | Str + Crit + Stam | Str 15, Crit 10, Stam 10 | Str 7.5, Crit 5, Stam 5 | 10 -> 5 |
| Waist | 0 (1.0) | Str + Haste + Vers | Str 15, Haste 10, Vers 10 | Str 15, Haste 10, Vers 10 | 10 -> 10 |
| Legs | 0 (1.0) | Str + Crit + Haste + Stam | Str 22.5, Crit 15, Haste 15, Stam 15 | Str 22.5, Crit 15, Haste 15, Stam 15 | 15 -> 15 |
| Feet | 0 (1.0) | Str + Haste + Crit | Str 15, Haste 10, Crit 10 | Str 15, Haste 10, Crit 10 | 10 -> 10 |
| Ring 1 | 0 (1.0) | Crit + Mastery | Crit 10, Mastery 10 | Crit 10, Mastery 10 | n/a |
| Ring 2 | -5 (0.73) | Haste + Vers | Haste 10, Vers 10 | Haste 7.3, Vers 7.3 | n/a |
| Main-hand (2h) | 0 (1.0) | Str + Crit + Haste + Stam | Str 60, Crit 40, Haste 40, Stam 40 | Str 60, Crit 40, Haste 40, Stam 40 | n/a |

"Base Stamina" is the automatic per-armor-slot grant described above, on top of whatever's itemized;
Neck, Rings, and the weapon don't grant it.

### Net stats

None of the primary/stamina stats get an inherent bonus - all four are built entirely from gear.
Versatility (37.3) adds 0.2x itself (+7.5) to Strength, Agility, Intellect, and Defence Rating below
- those totals already include it. Numeric meaning is only shown where we've actually locked in a
rating-to-effect formula (currently Defence Rating, MaxHP, Crit, Haste, Mastery, and Versatility) -
the rest are marked TBD pending the attack-math writeup.

| Stat | Total | Numeric meaning |
|---|---|---|
| Strength | 201.9 | +28.8 DPS, 26.8% Parry |
| Agility | 7.5 | +4.5 effective Crit Rating, 1.7% Dodge |
| Intellect | 7.5 | +4.5 effective Magic Crit Rating |
| Stamina | 171.9 | 1819 max HP |
| Crit rating | 131.8 effective (127.3 itemized + 4.5 from Agility) | 13.8% physical crit chance |
| Haste rating | 126.9 | 10.8% haste |
| Mastery rating | 20 | Mastery 13.1 |
| Versatility rating | 37.3 | see note above |
| Defence rating | 7.5 | 6.4% physical DR, 2.5% magic DR |
| Recovery rating | 0 | TBD |

Combined avoidance (Dodge + Parry, stacking): **28.1%**.

