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
See **Trainee Gear** below for how that's handled. This will also be used in cases where _some_ of
a character's gear isn't supported by the Zone (once provenance restrictions are implemented)

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

## Strength, Agility, and Intellect

There's no separate Attack Power stat. Whichever primary stat a class calls its damage stat feeds
directly into weapon/spell damage, at the same rate for all three:

```
SwingDamage = BaseWeaponDamage + (Strength / 90) * NominalSwingSpeed    -- physical (melee/1h)
SwingDamage = BaseWeaponDamage + (Agility / 90) * NominalSwingSpeed     -- physical (ranged/dex)
SpellDamage = BaseSpellDamage  + (Intellect / 90) * NominalCastTime     -- magic
```

`NominalSwingSpeed`/`NominalCastTime` is the weapon/spell's base timer - Haste changes how often
you swing/cast, not this per-hit damage calculation. `/90` was solved backward from a design
target (see **Basic Attack DPS** below), not chosen directly - it happens to land close enough for
all three stats that they share one divisor.

Each of the three also grants exactly one more secondary effect, always active regardless of which
stat is the class's actual damage stat (so a Strength class still benefits from Agility's Haste,
etc.) - **except** Intellect's two magic bonuses, which only ever apply against magic attacks, and
Strength/Agility's physical bonuses, which only ever apply against physical attacks:

```
EffectivePhysicalCritRating  += Strength  * 0.6
EffectivePhysicalHasteRating += Agility   * 0.6
EffectiveMagicCritRating     += Intellect * 0.3
EffectiveMagicHasteRating    += Intellect * 0.3
```

Intellect splits its bonus across both magic secondaries (0.3 each) rather than concentrating it in
one, mirroring Agility splitting its Avoidance contribution across both types instead of one - see
**Avoidance** below. Physical and magic Crit/Haste are otherwise independent pools; a character
only ever cares about whichever type matches their own attacks, but both pools use the same
itemized `crit_rating`/`haste_rating` stats as their base.

Strength and Intellect also each grant a pure Avoidance chance for their own attack type - Physical
for Strength, Magic for Intellect - and Agility grants a weaker split of both. See **Avoidance**
below.

Intellect additionally grows the character's resource pool (mana, energy, etc. - whichever their
class uses; the mapping from Intellect to that resource is class-specific, not a universal "mana"):

```
ResourcePool = Intellect * 10
```

**Design history:** Strength/Agility originally used `/7`/`/14` (Agility at half Strength's rate,
mirroring old WoW's 2 AP/1 AP split) with Agility solely feeding physical Crit. That was rebalanced
down 10x (to `/70`/`/140`) once basic attacks actually used the formula and it was multiplying DPS
~40x over baseline. Solving backward from an explicit DPS target (below) then showed the "Agility
at half rate" premise didn't hold once precisely worked out - Agility's Dodge doesn't feed DPS at
all, so its double-duty was worth much less than assumed - which is what motivated collapsing to a
single shared `/90` divisor and splitting Crit/Haste one-per-stat instead.

## Avoidance

Strength and Intellect each grant a pure chance to avoid an attack outright, for their own attack
type - Physical for Strength, Magic for Intellect - using identical numerics. Agility instead
splits a weaker version of both: 66% of Strength's rate toward Physical Avoidance, and 33% of
Intellect's rate toward Magic Avoidance.

```
EffectivePhysicalAvoidanceStat = Strength + Agility * 0.66
EffectiveMagicAvoidanceStat    = Intellect + Agility * 0.33

PhysicalAvoidance = 0.6 * EffectivePhysicalAvoidanceStat / (EffectivePhysicalAvoidanceStat + 250)
MagicAvoidance    = 0.6 * EffectiveMagicAvoidanceStat / (EffectiveMagicAvoidanceStat + 250)
```

Both asymptote toward 60% as their effective stat grows, hit ~26% at "full" investment in that stat
(~194 points, the same order of magnitude a fully-itemized primary stat reaches), and ~13% at half
that (e.g. the same character at `ee = -10`). Unlike Crit/Haste, this isn't a same-attack-type-only
split - a character with both Strength and Agility (or Intellect and Agility) itemized gets a real,
if partial, Avoidance chance against the *other* attack type too, since Agility always contributes
to both pools regardless of which is the class's actual damage stat.

There's no longer a separate Dodge-vs-Parry roll to stack - Physical Avoidance and Magic Avoidance
are each a single combined rate now, not two independent named mechanics.

**Implementation:** wired into basic attacks server-side (`command.IncomingDamage`) - a defender's
Avoidance is rolled first, then whatever lands is reduced by their Defence Rating (see below). This
applies whenever the *target* is a player; NPCs carry no `EquippedItems` so both are always 0 for
them, meaning a monster's basic attack currently has no incoming mitigation to reduce. Powers/spells
aren't wired to this yet - only basic attacks are.

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

Crit Rating grants a flat chance to critically strike, on top of a 5% base - separately for
physical (`crit_rating` + Strength's contribution) and magic (`crit_rating` + Intellect's
contribution) attacks, see **Strength, Agility, and Intellect** above. No asymptote - it's just
linear - but the rate is chosen so even a maximally crit-stacked character (full Crit Rating
itemization plus full primary stat contribution) stays well under 100%:

```
CritChance% = 5 + EffectiveCritRating / 15
```

## Haste Rating

Haste Rating grants attack/cast speed, applied multiplicatively (not additively) to shrink swing
timers, cast times, and channel durations, mirroring WoW - separately for physical (`haste_rating`
+ Agility's contribution) and magic (`haste_rating` + Intellect's contribution), see **Strength,
Agility, and Intellect** above. Unlike Crit, there's no base amount - 0 Haste Rating means 0% haste:

```
Haste% = EffectiveHasteRating / 11.71
```

A fully-itemized Haste build (445 Haste Rating, no primary-stat contribution) lands at 38% at
`ee = 0`, and 19% at `ee = -10` (half the secondary pool, so exactly half the Haste%, since this
formula has no base to break that proportionality).

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
whichever primary a class actually uses), Crit/Haste/Avoidance (from the off-primaries, which
always apply regardless of class), and Defence all at once. This is also why tanks have real stat
contention between Mastery, Defence Rating, and Versatility, rather than being able to itemize
everything into pure survivability.

## Defence Rating and damage reduction

There's no separate Armor stat. Instead, **Defence Rating** grants a direct percentage reduction to
incoming damage — a larger reduction against physical damage than against magic:

```
PhysicalDR(r) = 0.6 * r / (r + 98)
MagicDR(r)    = 0.4 * PhysicalDR(r) = 0.24 * r / (r + 98)
```

Where `r` is total Defence Rating (itemized `defence_rating` plus Versatility's 0.2x spread into
it - see **Versatility** above). This asymptotes toward 60% physical / 24% magic reduction as `r`
grows, and gives 0% reduction at `r = 0`. A fully-itemized tank (every eligible secondary slot on
Defence Rating, wielding a shield - `r ~= 520` at `ee = 0`) lands around **50.5% physical / 20.2%
magic** reduction; half that (`r ~= 260`) gives ~40.0% physical / ~16.0% magic.

**Design history:** originally `0.9`/`0.36` asymptotes. Avoidance barely differs between a tank and
a Strength DPS build (see **Avoidance** above) - almost the entire tank/DPS mitigation gap was
coming from Defence Rating alone, giving a fully-itemized tank ~76% physical DR, a 4.1x damage
multiplier by itself. Pulled down to land a fully-itemized tank near 50% physical DR instead (~2x
multiplier from DR), leaving the rest of the intended tank/DPS gap (see
[combat_balance.md](combat_balance.md)'s `EHP_tank = 3x EHP_dps` target) to come from Avoidance and
future passives/talents rather than gear alone.

**Implementation:** same as Avoidance above - wired into basic attacks server-side, applied after
the Avoidance roll, only reduces damage landing on a player target, and doesn't yet apply to
powers/spells.

## Miss Chance

Every attack and spell has a flat **5% chance to miss**, independent of and applied before any of
the target's own Avoidance or Defence Rating - a separate roll, not affected by any stat.

## Basic Attack DPS

A character's basic attack has no weapon-specific base damage or swing timer to derive from - items
don't carry stat *values*, only which stats they roll (see [item.md](schema/item.md)). Instead, a
completely naked character (no gear, not even Trainee Gear) has a flat **base DPS of 1** - matching
the game server's original flat-placeholder basic attack (1-3 dmg every 2s), before it was replaced
with this formula - modified by stats in aggregate (not per-swing). Strength/Agility drive a
physical basic attack; Intellect drives a magic one (a caster's basic "wand"/cantrip). At the naked
baseline, the 5% base crit chance and 5% miss chance roughly cancel out (monsters have no damage
reduction), leaving net DPS close to the base:

```
DamageStat = whichever of Strength/Agility/Intellect is the class's primaryStats damage stat (0 if none)
StatDPS    = DamageStat / 90

RawDPS = 1 + StatDPS
BasicAttackDPS = RawDPS * (1 + Haste%/100) * (1 + CritChance%/100 * (2.0 - 1)) * (1 - 0.05)
```

`Haste%`/`CritChance%` are the physical pair for a Strength/Agility character, or the magic pair
for an Intellect character - see **Crit Rating**/**Haste Rating** above. `2.0` is the crit
multiplier used throughout these docs' examples; `0.05` is the miss chance above.

**Why `/90`:** this was solved backward from a design target, not chosen directly - a fully-
itemized, on-level DPS build (primary maxed on the damage stat, secondaries split evenly across
that damage type's Crit/Haste) should net **5 basic attack DPS**, the same for a Strength, Agility,
or Intellect build, so a full "DPS-geared, going full out" character nets ~25 total DPS across all
their abilities (basic attack is meant to be ~1/5 of full output - see
[combat_balance.md](combat_balance.md)). Solving that target independently for each stat (raw
primary 217.5, raw secondaries 222.5/222.5 at `ee=0`, all fully itemized) gives divisors of ~89
(Strength), ~92 (Agility), ~91 (Intellect) - close enough to collapse into one shared `/90`.

`BasicAttackDPS` above is the *expected* value used for display (the character sheet tooltip). Each
individual swing that lands varies around its own nominal (pre-crit) damage: a flat/uniform
distribution within +/-10%, independently of the crit roll - so even non-crit swings aren't all
identical.

## Trainee Gear

Any equipment slot without a real item in it is treated as holding a generated "Trainee Gear" item
for that slot, rather than being empty. These aren't real items — they're synthesized at runtime
from the character's class. Each class specifies a ranked list of `primaryStats` (usually one, but
hybrid classes may list more) and a ranked list of exactly five `secondaryStats`; the generated
gear is itemized from those lists, and has an elvl of 0. Two characters of the same class always
get the same Trainee Gear. The client displays them dimmed out, so it's clear to the player that
the character isn't wearing a real item. (The initial zones for a world should generally be
between elevations 0 and 10.)

### Stat allocation

A class can list 1-3 primary stats, and _must_ list 5 secondary stats, each in a ranking order -
the trainee gear obeys that order, biasing its items toward the earlier listed stats in each case.

| Slot (weight) | 1 primary | 2 primaries | 3 primaries | Secondary stats |
|---|---|---|---|---|
| `main_hand` + `off_hand` (4.0) | A | A | A | v, w, x |
| Head (1.5) | A | A | B | v, w, x |
| Neck (1.0) | - | - | - | v, w, x |
| Shoulders (1.0) | A | B | B | w, y |
| Back (1.0) | A | A | A | v, w |
| Chest (1.5) | A | B | C | v, w, x |
| Wrists (1.0) | A | A | B | v, y |
| Hands (1.0) | A | B | A | v, z |
| Ring 1 (1.0) | - | - | - | v, x |
| Ring 2 (1.0) | - | - | - | w, y |
| Waist (1.0) | A | A | B | v, y |
| Legs (1.5) | A | B | A | v, w, x |
| Feet (1.0) | A | A | C | v, z |

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

**Note:** this worked example (and Bob's below), including the Net Stats table, predates the
Strength/Agility divisor rebalance, the later Crit/Haste stat swap, and the Avoidance rework above
- its `/7` division is now `/90`, Crit Rating here would now come from Strength (not Agility)
directly, and Parry/Dodge no longer exist as separate stacking rolls (see **Avoidance**). The
numbers below haven't been recomputed; treat them as stale/illustrative of the calculation shape,
not current values. See "Basic Attack DPS" above for the formula actually implemented (which also
has no `BaseWeaponDamage`/`NominalSwingSpeed` to plug in - those don't exist anywhere in the item
schema).

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

### Adam's basic attack

Two-hander, base 10 dmg, nominal 1.9s swing:

| | |
|---|---|
| SwingDamage (pre-crit) | `10 + (201.9/7) * 1.9 = 64.8` |
| Crit chance | 13.8% (131.8 effective physical Crit Rating) |
| Crit multiplier | 2.0x |
| Avg damage/swing | `64.8 * (1 + 0.138 * 1.0) = 73.7` |
| Haste | 10.8% |
| Avg swing interval | `1.9 / 1.108 = 1.72s` (jittered +/-10% per swing) |
| Sustained DPS | `73.7 / 1.72 ~= 43.0` |

### Attack against Adam

Example incoming physical hit, 100 raw damage:

| | |
|---|---|
| Total avoidance (Dodge + Parry) | 28.1% chance fully avoided |
| Physical DR | 6.4% |
| Damage if it lands | `100 * (1 - 0.064) = 93.6` |
| Expected damage per attack | `(1 - 0.281) * 93.6 ~= 67.3` |

Avoidance is checked first (a full miss); whatever lands is then reduced by DR - the two layers
don't interact otherwise.

## Bob - Strength Tank with a Shield

One-hand weapon + shield, 14 equipped slots. 7 on-level (ee=0, em=1.0), 4 at ee=-5 (em=0.73), 3 at
ee=-10 (em=0.5). Every secondary is itemized toward Defence Rating + Stamina (plus Mastery where a
3rd secondary slot exists) - no Crit, Haste, or Versatility at all.

| Slot | ee (em) | Allocation | Scaled stats |
|---|---|---|---|
| Head | 0 (1.0) | Str + Def + Stam + Mastery | Str 22.5, Def 15, Stam 15, Mastery 15 |
| Neck | -5 (0.73) | Def + Stam + Mastery | Def 7.3, Stam 7.3, Mastery 7.3 |
| Shoulders | -5 (0.73) | Str + Def + Stam | Str 10.95, Def 7.3, Stam 7.3 |
| Back | -10 (0.5) | Str + Def + Stam | Str 7.5, Def 5, Stam 5 |
| Chest | 0 (1.0) | Str + Def + Stam + Mastery | Str 22.5, Def 15, Stam 15, Mastery 15 |
| Wrists | -5 (0.73) | Str + Def + Stam | Str 10.95, Def 7.3, Stam 7.3 |
| Hands | -10 (0.5) | Str + Def + Stam | Str 7.5, Def 5, Stam 5 |
| Waist | 0 (1.0) | Str + Def + Stam | Str 15, Def 10, Stam 10 |
| Legs | 0 (1.0) | Str + Def + Stam + Mastery | Str 22.5, Def 15, Stam 15, Mastery 15 |
| Feet | 0 (1.0) | Str + Def + Stam | Str 15, Def 10, Stam 10 |
| Ring 1 | -5 (0.73) | Def + Stam | Def 7.3, Stam 7.3 |
| Ring 2 | -10 (0.5) | Def + Stam | Def 5, Stam 5 |
| Main-hand (1h) | 0 (1.0) | Str + Def + Stam + Mastery | Str 30, Def 20, Stam 20, Mastery 20 |
| Off-hand (shield) | 0 (1.0) | 2.5x Def (primary slot) + Def + Stam + Mastery | Def 75 + 20, Stam 20, Mastery 20 |

Plus base Stamina (armor-slot grant): **89.6**.

### Net stats

| Stat | Total | Numeric meaning |
|---|---|---|
| Strength | 164.4 | +23.5 DPS, 23.8% Parry |
| Agility | 0 | no gear itemized |
| Intellect | 0 | no gear itemized |
| Stamina | 238.8 | 2488 max HP |
| Crit rating | 0 | 5% physical crit chance (base only) |
| Haste rating | 0 | 0% haste |
| Mastery rating | 92.3 | Mastery 22.8 |
| Versatility rating | 0 | none |
| Defence rating | 224.2 | 62.6% physical DR, 25.1% magic DR |

### Bob's basic attack

One-hand weapon, base 5 dmg, nominal 1.2s swing:

| | |
|---|---|
| SwingDamage (pre-crit) | `5 + (164.4/7) * 1.2 = 33.2` |
| Crit chance | 5% (no Crit Rating itemized) |
| Avg damage/swing | `33.2 * 1.05 = 34.8` |
| Haste | 0% |
| Avg swing interval | 1.2s (+/-10% jitter) |
| Sustained DPS | `34.8 / 1.2 ~= 29.0` |

### Attack against Bob

Same example incoming physical hit, 100 raw damage:

| | |
|---|---|
| Total avoidance | 23.8% (Parry only, no Dodge) |
| Physical DR | 62.6% |
| Damage if it lands | `100 * 0.374 = 37.4` |
| Expected damage per attack | `0.762 * 37.4 ~= 28.5` |

Bob takes about 42% of what Adam takes from the same hit (28.5 vs 67.3) - plausible as a
passive-only (no active mitigation cooldowns) baseline, though real tankiness in WoW leans heavily
on cooldowns stacked on top of this kind of baseline.

