# Combat Balance Targets

This is the design target this project is building *toward* - guidelines, not implemented math.
It works backward from desired play feel (how long fights take, how much health they cost) to
enemy HP and damage. See [stats.md](stats.md) for what's actually implemented today.

Scope so far: `open` and `g1` enemies (parties aren't implemented), from `ee = 0` down to
`ee = -10`. Larger group sizes are provisional - see **Group sizes (provisional)**.

## Definitions

- **TTK** (time to kill): how long one character takes to kill the enemy (or the whole pull) alone.
- **HP lost**: the share of that character's health the fight costs them, after mitigation and
  avoidance. "Net DPS" is the enemy's damage per second after mitigation and avoidance.
- **EHP** (effective HP): raw HP inflated by mitigation/avoidance.
- **TTD** (time to die): EHP / the enemy's net DPS. HP lost = TTK / TTD.
- **ee**: effective elevation, `item elvl - map elvl` (see [stats.md](stats.md)). Lower ee means
  the character is under-geared for the map.

## Unit type tags

Each unit type carries tags (the unit type's `tags` field, see
[schema/unit_type.md](schema/unit_type.md)) saying which guidelines it's built against.

| Category | Tags | Meaning |
|---|---|---|
| Audience | `open`, `g1`, `g2`, `g3`, `g5`, `g10` | How many players it's meant to oppose. `open` is a public quest-zone mob; `gX` is a dungeon elite for X players (`g1` is a solo-dungeon elite, like WoW's delves). |
| Pull size | `solo`, `pair`, `group`, `swarm` | How many units come in a normal pull: 1, 2, 3-4, 5-8. |
| Role | `healer`, `tough`, `debuffs`, `buffs`, `glass` | Its job in the encounter. |
| Damage type | `caster`, `melee`, `ranged` | Flavor only - no budget effect (but see **Damage type**). |

## Gear profiles

Targets are given against three gear profiles at the same ee. "Squishy" means DPS gear with zero
defensive stats - caster vs melee makes no difference.

| Profile | TTK | EHP | HP lost | Expected for |
|---|---|---|---|---|
| squishy | 1.0x | 1.0x | 1.0x | `open` content |
| tanky DPS | 1.25x | 2x | 0.625x | `g1` content (any class, tanks included) |
| tank | 1.5x | 3x | 0.5x | tanking groups |

Tanky DPS splits the difference between squishy and tank on both output and survivability. The tank
row is the old design rules: a tank's TTK is 50% higher than a DPS's, and its EHP is 3x.

## `open` enemies

Modelled on Wrath/Cata-era WoW questing: at-level mobs die in about 12 seconds.

### By elevation (squishy, `solo` pull)

| ee | Feels like | TTK | HP lost |
|---|---|---|---|
| 0 | at-level questing | 12s | 20% |
| -5 | a zone 1-2 levels above you | 15s | 30% |
| -10 | fighting solo-dungeon elites | 30s | 65% |

Going down in ee, the character kills slower by `a` (1, 1.25, 2.5) and the enemy hits relatively
harder by `b` (1, 1.2, 1.3). HP lost = 20% * a * b. Both factors must only grow as ee drops.

### Multi-pulls

Killing n equal enemies one at a time costs `n(n+1)/2` times one enemy's HP lost (all of them hit
you while the first dies, and so on).

| ee | 1 enemy | 2 (x3) | 3 (x6) | Intent |
|---|---|---|---|---|
| 0 | 20% | 60% | 120% | a double-pull is fine but needs a rest; a triple needs defensives |
| -5 | 30% | 90% | - | a double-pull is frantic |
| -10 | 65% | ~195% | - | a double-pull is a wipe |

### Tank and tanky DPS (`solo` pull)

| ee | Tank TTK | Tank HP lost | Tanky DPS TTK | Tanky DPS HP lost |
|---|---|---|---|---|
| 0 | 18s | 10% | 15s | 12.5% |
| -5 | 22.5s | 15% | 19s | 19% |
| -10 | 45s | ~33% | 37.5s | ~41% |

A tank can take roughly one more enemy per pull than a squishy at each ee (4 at ee=0 is lethal).

## `g1` enemies

A `g1` elite at `ee = 0` feels like an `open` enemy at `ee = -10`. Relative to an `open` enemy: HP
x2.5, net DPS x1.3. Elevation applies the same `a`/`b` factors as `open`. Characters are expected to
fight them in tanky DPS gear.

| ee | Squishy | Tanky DPS | Tank |
|---|---|---|---|
| 0 | 30s / 65% | 37.5s / 41% | 45s / ~33% |
| -5 | 37.5s / ~98% | 47s / 61% | 56s / ~49% |
| -10 | 75s / dead | 94s / dead | 112s / ~105% (dead) |

(TTK / HP lost, `solo` pull.) Every `g1` pull is followed by a rest.

## Pull size

The numbers above are for `solo` pulls. Bigger pulls take longer and cost more, as a whole:

| Pull | Units (n) | Pull TTK | Pull HP lost | Each unit's HP | Each unit's net DPS |
|---|---|---|---|---|---|
| `solo` | 1 | x1.0 | x1.0 | x1.0 | x1.0 |
| `pair` | 2 | x1.3 | x1.2 | x0.65 | x0.62 |
| `group` | 3-4 | x1.6 | x1.4 | x0.53-0.40 | x0.44-0.35 |
| `swarm` | 5-8 | x1.9 | x1.6 | x0.38-0.24 | x0.28-0.19 |

Per unit, relative to a `solo` unit of the same audience:

```
unit HP      = solo HP  * pullTTK / n
unit net DPS = solo DPS * pullHPLost / (pullTTK * (n + 1) / 2)
```

This assumes units die one at a time to single-target damage; area damage makes `group` and `swarm`
pulls faster than these targets.

At `ee = 0` (TTK / HP lost for the whole pull):

| | `solo` | `pair` | `group` | `swarm` |
|---|---|---|---|---|
| `open`, squishy | 12s / 20% | 15.6s / 24% | 19.2s / 28% | 22.8s / 32% |
| `g1`, squishy | 30s / 65% | 39s / 78% | 48s / 91% | 57s / 104% |
| `g1`, tanky DPS | 37.5s / 41% | 49s / 49% | 60s / 57% | 71s / 65% |

`g1` group and swarm pulls are near-lethal or lethal for a squishy - that's intended.

## Roles

Applied to a unit's share of the pull budget:

| Role | HP | Net DPS | Notes |
|---|---|---|---|
| `glass` | x0.5 | x1.3 | Glass cannon: dies in half the time, costs x0.65 the HP. |
| `tough` | x2 | x0.5 | Takes twice as long, costs the same HP. |
| `buffs` | - | x0.8-0.9 | Gives up damage to improve its allies. |
| `debuffs` | - | x0.8-0.9 | Gives up damage to weaken its target. |
| `healer` | x0.67 | - | A DPS that also heals. |

A healer's HPS is at most 50% of a tank's DPS at `ee = 0` (8.3/s), so a tank can
always out-damage it on level. The x0.67 HP pays for that healing: healing itself constantly, a
solo `open` healer still dies in 12s to a squishy, 17s to tanky DPS, 24s to a tank. Below roughly
`ee = -8` a tank can no longer out-damage the healing.

## Damage type

`caster`, `melee` and `ranged` don't change the budget, but mitigation differs by school (see
[stats.md](stats.md)): a full tank's Defence Rating cuts about 50% of physical damage but only about
20% of magic, and Strength's avoidance only covers physical. Intellect's covers magic, so casters
avoid more magic. The EHP targets above are effectively against physical damage: tanks take
noticeably more from `caster` units, casters noticeably less.

## Implied enemy stats (`ee = 0`)

`D = 25` is a squishy character's full sustained DPS at `ee = 0` (see **D** below). The reference
squishy EHP is **1500**: on-level gear with no Stamina, Defence or Versatility has 1150 HP (835
flat, plus 3 per point of the armor slots' 105 base Stamina). Against physical attacks its primary stat's Avoidance makes that
1150 EHP (Intellect), 1472 (Agility) or 1595 (Strength); 1500 is the rounded middle. A unit type's `dps` is raw damage, before the
target's mitigation: `dps = 1500 * HP lost / TTK`.

| Pull | Units | `open` HP | `open` dps | `g1` HP | `g1` dps |
|---|---|---|---|---|---|
| `solo` | 1 | 300 | 25 | 750 | 32.5 |
| `pair` | 2 | 195 | 15.4 | 490 | 20 |
| `group` | 3 / 4 | 160 / 120 | 10.9 / 8.8 | 400 / 300 | 14.2 / 11.4 |
| `swarm` | 5 / 8 | 115 / 70 | 7.0 / 4.7 | 285 / 180 | 9.1 / 6.1 |

Per unit; apply the role multipliers on top. At a 0.5s-2.5s attack interval these keep most hits
to 1-2 digits.

## Elevation check

A squishy with all gear at one ee, against mobs that don't scale with elevation. `D = 25` at
`ee = 0` is 5 from basic attacks plus 20 from abilities. EHP is against physical attacks.

| ee | DPS | Kill slowdown `a` (target) | EHP drop `b`, Str / Agi / Int (target) | HP lost, Str / Int (target) |
|---|---|---|---|---|
| -5 | ~17 | 1.47 (1.25) | 1.15 / 1.14 / 1.08 (1.2) | 34 / 32% (30%) |
| -10 | ~11 | 2.26 (2.5) | 1.31 / 1.28 / 1.16 (1.3) | 60 / 53% (65%) |

Before authored amount scaling (see [stats.md](stats.md)), `a` was only 1.19 / 1.40 and HP lost at
-10 was ~36%. Intellect characters lose less EHP going down because they have no physical
avoidance to lose.

## Group sizes (provisional)

Not yet reviewed against the `open`/`g1` work above. The original rules, now anchored on `g1`:

1. TTK scales linearly with group size: `TTK(n) = n * TTK(g1)`, so enemy HP is `750n`.
2. TTD scales down with group size by a fixed factor:

   | n | 1 | 2 | 3 | 5 | 10 | 25 |
   |---|---|---|---|---|---|---|
   | TTD factor | 1.0 | 0.9 | 0.75 | 0.6 | 0.4 | 0.35 |

   So enemy net DPS is `1 / factor(n)` times a `g1` enemy's (2.86x at 25).
3. The tank's 3x EHP ratio holds at every group size.

## Resolved: `D` (a DPS-geared character's full sustained DPS)

**`D = 25`** at `ee = 0`, going full out - 5 of that from basic attacks (all stats included), the
rest from abilities. This holds identically whether the character is a Strength, Agility, or
Intellect build - see [stats.md](stats.md)'s "Basic Attack DPS" section for the `/90` divisor
solved backward from this target.

## Open questions

1. **Tank and tanky DPS EHP from gear.** With `MaxHP = 835 + Stamina * 3` and the current Defence
   curve, gear alone gets a tank (one-hander + shield, best split, vs physical) to ~3.2x squishy EHP
   and tanky DPS to ~2.0x - on target. Their best splits lean on Stamina (~80% / ~50%); that's
   accepted, since Defence pulls ahead whenever there's healing or no rest between fights.
2. **Elevation curve shape.** With authored amount scaling, -5 is slightly harsh and -10 slightly
   soft (see **Elevation check**). That's the `em` curve's shape; tune it only if play shows it
   matters, without drastically changing the relative value of stats between -10 and 0.
3. **Group sizes above `g1`** need the same review `open` and `g1` got.
4. **Hit size.** No damage cap, but numbers on screen should usually be 1-2 digits for readability.
   Attack intervals are mostly 0.5s-2.5s.
