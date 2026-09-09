# Combat Balance Targets

This is the design target this project is currently building *toward* - not yet implemented math.
It works backward from desired play feel (how long fights should take) to the formulas that will
eventually set enemy HP/damage and player DPS/EHP. See [stats.md](stats.md) for what's actually
implemented today (player basic attack DPS only).

Scope for this pass: **elevation 0 (`ee = 0`) only**, across group sizes. Elevation's effect on
these numbers (-5e, -10e, -20e, etc.) is deliberately deferred - see "Open questions" below.

## Definitions

- **TTK** (time to kill, *for one individual*): a hypothetical "if this one player's own output were
  the only thing hurting the enemy" clock. It is a sizing tool for enemy HP, not a claim about how
  long real group fights take (a full group's combined DPS would kill an n-sized-intended enemy in
  roughly constant time, since HP scales with n).
- **TTD** (time to die): how long that one player would survive taking *all* of the enemy's hits
  alone (i.e. solo-tanking it), given their own EHP (effective HP - raw HP inflated by
  mitigation/avoidance).
- **G*n*** ("group size *n*"): the enemy is stat-intended for a group of that size (solo, small
  group, dungeon, raid).

## Design rules (as given)

1. TTK as tank or healer is ~50% higher than as DPS (both roles hold back their full DPS output).
2. TTD as tank at G1 is ~3x TTD as DPS or healer (who match each other).
3. TTK scales **linearly** with group size: `TTK(n) = n * TTK(1)`.
4. TTD scales **sub-linearly down** with group size, via a fixed per-size factor:

   | n | 1 | 2 | 3 | 5 | 10 | 25 |
   |---|---|---|---|---|---|---|
   | TTD factor | 1.0 | 0.9 | 0.75 | 0.6 | 0.4 | 0.35 |

5. G1 anchors (e=0): tank TTD=60s, dps/heal TTD=20s, tank TTK=12s, dps TTK=8s.

## Two assumptions I made to fill gaps

Flagging these explicitly since the source numbers didn't pin them down - correct me if wrong:

- **Healer TTK = Tank TTK.** Rule 1 says "tank *or* healer" get the same +50% over DPS, and the
  worked examples only ever give one number for "tank TTK" - so I've treated healer TTK as identical
  to tank TTK (12s at G1), not a third value.
- **The tank's 3x TTD ratio holds at every group size**, not just G1. Rule 2 says "at G1" - I read
  that as tank EHP being a fixed multiple of dps/heal EHP (a gearing/class trait), so the ratio
  carries through unchanged as the shared TTD-factor scales both roles down together. If tanks are
  meant to get *relatively* squishier (or tankier) in bigger groups, that needs its own rule.

## The full matrix (e = 0)

**TTK (individual, seconds)** = `n * TTK(1)`

| n | DPS | Tank / Healer |
|---|---|---|
| 1 | 8 | 12 |
| 2 | 16 | 24 |
| 3 | 24 | 36 |
| 5 | 40 | 60 |
| 10 | 80 | 120 |
| 25 | 200 | 300 |

**TTD (seconds)** = `TTD(1) * factor(n)`

| n | DPS / Healer | Tank |
|---|---|---|
| 1 | 20 | 60 |
| 2 | 18 | 54 |
| 3 | 15 | 45 |
| 5 | 12 | 36 |
| 10 | 8 | 24 |
| 25 | 7 | 21 |

## What this implies for enemy HP/DPS

Let `D` = a DPS-geared character's full sustained DPS at `ee=0` (target: `5 * BasicAttackDPS`, per
your note - not yet a concrete number, see below). Let `EHP_dps` = a DPS/healer-geared character's
effective HP at `ee=0`.

```
Enemy_HP(n)  = D * TTK_dps(n)        = 8Dn
Enemy_DPS(n) = EHP_dps / TTD_dps(n)
EHP_tank     = 3 * EHP_dps           (constant, from the TTD ratio holding at every n)
```

`Enemy_DPS(n)` relative to G1 (i.e. `20 / TTD_dps(n)`):

| n | 1 | 2 | 3 | 5 | 10 | 25 |
|---|---|---|---|---|---|---|
| Enemy DPS multiplier | 1.0x | 1.11x | 1.33x | 1.67x | 2.5x | 2.86x |

So a G25 raid boss should hit for ~2.86x what a G1 solo mob hits for, and should have 25x a G1 mob's
HP - both are direct consequences of the rules above, not new choices.

## Resolved: `D` (a DPS-geared character's full sustained DPS)

**`D = 25`** at `ee = 0`, going full out - 5 of that from basic attacks (all stats included), the
rest from abilities. This holds identically whether the character is a Strength, Agility, or
Intellect build - see [stats.md](stats.md)'s "Basic Attack DPS" section for the `/90` divisor (plus
the Crit/Haste stat swap - Strength now feeds physical Crit, Agility physical Haste, Intellect a
split of both magic secondaries) solved backward from this exact target.

```
Enemy_HP(n) = 8 * 25 * n = 200n
```

So a G1 mob has 200 HP, a G25 raid boss has 5000.

## Open questions (next steps, per your own ordering)

1. **What's `EHP_dps` (and thus `EHP_tank = 3x` it)?** Raw HP (Stamina) and mitigation/avoidance are
   both implemented in isolation (docs/stats.md) but haven't been combined into a target EHP number,
   or budgeted between "gear" and "class/spec passives." Per your last note, this is deliberately
   deferred until outgoing damage (enemy DPS) is worked out first.
   Answer: Yes - we want the gear to make a substantial portion of the difference (we want tanks to
   _want_ to wear tank gear). We'll probably just see the difference on gear alone between tank and dps,
   then either update the gear scaling, or decree another target for the mitigation _from passives/talents_
   that class definitions can aim for.
2. **Per-hit damage cap (<100).** `Enemy_DPS(n)` is a rate, not a per-swing number - translating it
   to "<100 per hit" needs the enemy's attack interval, which you've since pinned to **0.5s-2.5s,
   mostly**. Still need to decide how interval varies by group size (do bigger/tougher intended
   enemies swing slower with bigger hits, or faster?) before checking the cap.
   Answer: no actual damage cap - this is intended to be a guideline, so that the numbers flashing on
   the screen are usually 1-2 digits, and thus more readable.
3. **Elevation (-5e, -10e, -20e).** Deferred per your instruction - once outgoing damage is pinned
   at e=0, the elevation multiplier curve (`em(ee)`, see stats.md) will need to reshape *both* sides
   (player output/EHP via gear scaling, which already uses `em`, and enemy HP/damage, which doesn't
   vary by elevation today - "since we don't specify different monster damage/hp based on the
   relative elevations") to hit the -5e/-10e/-20e example targets you gave.
   Answer: we'll need to see what effect the _existing_ elevation calculation has, and how close it
   is. If it's way off we may need to adjust strategies, but we'll try tweaking the curve first. In
   particular, we don't want the _relative incremental value_ of the various stats to change drastically
   from -10e to 0e - the gear you want to acquire going into a raid-level should be similar to the
   gear you want to own at the end of it.
