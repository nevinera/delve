# Stats and Equipment

Delve uses a stat system modeled on modern World of Warcraft (The War Within, Season 1),
adapted for a no-level, gear-only progression structure with no equipment-type split.

---

## Stats

### Primary Stats

Exactly one primary offensive stat is relevant to any given class. All three appear on
T0 gear (so new players don't need to know their class before equipping starter items).

| Stat | Scales | Used By |
|---|---|---|
| **Strength** | Melee physical damage | Warriors, Paladins, brawlers |
| **Agility** | Ranged/finesse physical damage; also grants bonus crit | Rangers, rogues, shifters |
| **Intellect** | Spell damage and healing output | Mages, clerics, druids |
| **Stamina** | Maximum HP (10 HP per point); universal on all gear | Everyone |

### Secondary Stats

Secondary stats come as ratings - you accumulate rating points from gear, and the game
converts them to percentages. At T2 content (zone_level 0), conversion rates are
calibrated to match current WoW values. Zone-level scaling modifies these rates at
higher content tiers (see Zone Level, below).

| Stat | Effect |
|---|---|
| **Crit Rating** | Each 1% crit: abilities have a 1% chance to deal/heal double |
| **Haste Rating** | Each 1% haste: reduces GCD and cast times, increases DoT tick rate, speeds auto-attacks |
| **Mastery Rating** | Spec-specific bonus; defined per class (see individual class docs) |
| **Versatility** | Each 1% vers: +1% damage and healing dealt, +0.5% damage taken reduction |
| **Resilience** | Each 1% resilience: improves armor multiplier (see Armor, below) |

**Rating to percent formula (at zone_level 0):**

```
pct(rating) = rating / C
```

Where `C` is calibrated to current WoW T2-content conversion rates - approximately
20 rating per 1% at ilvl 610. The exact value should be derived from the live WoW item
database rather than hardcoded here.

At higher zone levels, `C` is multiplied by `r^zone_level` (see Zone Level).

### Derived Stats

| Derived Stat | Formula |
|---|---|
| **Offensive Power** | `primary_stat × 2` (Attack Power for Str/Agi; Spell Power for Int) |
| **Max HP** | `100 + stamina × 10` |
| **Crit Chance** | `5% base + crit_rating / (C × r^zone_level)` |
| **Haste Percent** | `haste_rating / (C × r^zone_level)` |
| **Versatility Percent** | `versatility_rating / (C × r^zone_level)` |
| **Effective GCD** | `max(1.0s, 1.5s / (1 + haste_pct))` |
| **Armor** | `base_armor × armor_multiplier` (see Armor) |

---

## Armor

Without equipment-type splits, armor is derived from Resilience rather than being a free
stat determined by gear class. Every character gets the same base armor from each slot
(equivalent to WoW cloth baseline), and Resilience scales that up.

**Base armor per slot** scales linearly with ilvl, calibrated to WoW cloth values.

**Armor multiplier formula:**
```
R_eff             = resilience + 0.25 × versatility
armor_multiplier  = 1 + 4 × (R_eff / (R_eff + 5 × mean_gear_ilvl))
```

Asymptotes to 5× at infinite Resilience. A tank stacking Resilience at their appropriate
content tier hits approximately 4×.

**Multiplier examples at T2 (mean ilvl ~610):**

| Resilience | Multiplier | Equivalent to |
|---|---|---|
| 0 | 1.0× | WoW cloth |
| ~760 | 2.0× | WoW leather |
| ~1525 | 3.0× | WoW mail |
| ~3050 | 3.7× | WoW mail+ |
| ~4575 | 4.0× | WoW plate |

(These Resilience values scale with `5 × mean_gear_ilvl`, so the same multipliers at T3
require proportionally more Resilience - a natural tank progression gate.)

The Versatility contribution means even casters who ignore Resilience get marginal armor
improvement from Versatility accumulated for its damage/healing bonus.

---

## Gear Tiers

| Tier | Mean ilvl | Source | Zone level |
|---|---|---|---|
| **T0** | ~528 | Trainee gear (starter, class-neutral) | 0 |
| **T1** | ~584 | Main quest campaign rewards | 0 |
| **T2** | ~610 | Normal dungeon drops | 0 |
| **T3** | ~636 | Heroic dungeon drops | 1 |
| **T4** | ~649-662 | Raid drops | 2 |
| **T5** | ~675+ | (future) | 3 |

Ilvl values are approximations based on TWW Season 1 and should be confirmed against
current WoW patch data. The tier-over-tier power growth factor `r` (see Zone Level) is
derived from the actual ilvl stat budget differences between tiers.

### T0 - Trainee Gear

Starting equipment, identical for all classes:
- All three primary offensive stats present in equal amounts (class-neutral)
- Secondary budget heavily weighted toward Versatility
- Resilience present but low

T0 is intentionally weak - it signals "you should be doing quests now."

### T1 - Quest Greens

Acquired through the main quest line and world content. Introduces class-appropriate
secondary selection (a tank's T1 items have Resilience; a caster's have Haste/Crit).
Appropriate for open-world content and its boss encounters.

### T2 - Normal Dungeon Blues

First tier of organized group content. The **base calibration tier** for all combat
numbers. Enemy and encounter designs use T2-normalized stat values.

### T3+ - Heroic Dungeons, Raids, and Beyond

Zone-level scaling engages starting at T3. See Zone Level below.

---

## Zone Level

Zone level is a per-zone configuration value that normalizes combat across content tiers.
It solves the secondary stat inflation problem (where WoW players accumulate ever-larger
rating values per expansion) without requiring expansion squishes.

### Schedule

```
T0-T2 zones: zone_level = 0   (no scaling; WoW-equivalent behavior)
T3 zones:    zone_level = 1
T4 zones:    zone_level = 2
T5 zones:    zone_level = 3
...
```

Zone level may be a floating-point value for fine-grained tuning within a tier.

### Normalization Factor

```
normalization = r^zone_level
```

Where `r` is the tier-over-tier gear power growth ratio - a server-level constant derived
from the stat budget difference between adjacent content tiers.

### Effect on Gameplay

Inside a zone with zone_level > 0, all player stat contributions are divided by
`normalization` before any combat calculation:

- Primary stat (and therefore Offensive Power)
- All secondary rating effectiveness (via `C × normalization` denominator)
- Max HP from Stamina

Enemy and encounter definitions are always written in T2-normalized terms. At runtime,
enemy HP and damage values are multiplied by `normalization` when instantiated.

The net effect: a player running T3 content in T2 gear experiences **the same combat
ratios** as a player running T2 content in T1 gear. The gear delta is what determines
difficulty, not the absolute numbers.

This means encounter definitions, unit types, and monster powers can be authored once and
reused at any tier simply by placing them in a zone with the appropriate zone_level.

### Visual Re-scaling

After normalization (which has no gameplay effect within a zone), all displayed combat
numbers are multiplied back up by `normalization`:

- HP bars and health values
- Damage and healing numbers shown to players

This means numbers still feel larger at higher tiers - a T4 fight shows four-digit HP
bars and hundreds of damage per hit rather than the T2 equivalents. The visual scale is
cosmetic: within any zone, the gameplay ratios are T2-equivalent.

---

## Item Level and Budget

Item stat budgets scale with ilvl. At max-level content (T1+), the scaling within a
content cycle is approximately linear per ilvl point. The exact constants are calibrated
to WoW's live item data and should be pulled from the WoW item database rather than
hardcoded.

### Slot Types

**Primary-stat slots** (head, shoulders, chest, hands, waist, legs, feet, wrists):
- One primary offensive stat
- Stamina (~1.5× the primary stat amount)
- One secondary stat

**Accessory slots** (neck, back, ring ×2):
- Stamina
- Two secondary stats (no primary)

**Weapon** (main hand):
- Primary offensive stat
- Stamina
- One secondary stat
- Weapon damage (separate from stat budget; scales with ilvl)

**Trinket / off-hand**:
- Two secondary stats (no stamina on trinkets)

### Approximate Stat Totals by Tier

A fully-geared character with appropriate secondary selection (not splitting across
all five secondaries equally):

| Tier | Mean ilvl | Primary stat | Stamina | Stacked secondary |
|---|---|---|---|---|
| T0 | ~528 | - | - | vers-heavy, mixed primaries |
| T1 | ~584 | ~4,500 | ~6,800 | ~3,000 in one stat |
| T2 | ~610 | ~5,800 | ~8,700 | ~3,900 in one stat |
| T3 | ~636 | ~7,200 | ~10,800 | ~4,800 in one stat |
| T4 | ~655 | ~8,500 | ~12,800 | ~5,700 in one stat |

These are rough estimates; actual values depend on WoW item database. The important
property is the tier-over-tier ratio, which determines `r`.

---

## Ability Mechanics

### Damage Formula

```
hit_damage  = base_damage × primary_mult × versatility_mult
crit_damage = hit_damage × 2.0
expected    = hit_damage × (1 + crit_chance)
```

Where:
```
primary_mult     = 1 + offensive_power / K
versatility_mult = 1 + versatility_pct
```

`K` is a global tuning constant (the divisor that controls how much primary stat matters
relative to base ability damage). Zone-level normalization divides `offensive_power`
before this formula runs, not `K` itself.

### GCD and Haste

```
effective_gcd = max(1.0s, 1.5s / (1 + haste_pct))
```

Haste also scales auto-attack speed and DoT tick frequency identically.

### Ability Types

**Simple melee attack** (e.g., Punch):
```
expected_damage = base × primary_mult × versatility_mult × (1 + crit_chance)
dps_contribution = expected_damage / effective_gcd
```
Affected by: Strength/Agility, Crit, Versatility, Haste (via GCD).

**Spell** (e.g., Frostbolt):
```
expected_damage = base × primary_mult × versatility_mult × (1 + crit_chance)
```
Identical formula; primary stat is Intellect. Haste reduces cast time rather than GCD.

**Damage over time (DoT)**:
```
tick_damage   = base_tick × primary_mult × versatility_mult × snapshot_crit_mult
ticks_per_sec = base_tick_rate × (1 + haste_pct)
total_dps     = tick_damage × ticks_per_sec
```
Crit is snapshotted at application as a flat multiplier on all ticks (avoids
haste/crit interaction weirdness mid-channel). Affected by: primary stat, Versatility,
Haste (tick rate). Crit is baked in at application, not per-tick.

**Heal**:
```
expected_heal = base × primary_mult × versatility_mult × (1 + crit_chance)
```
Healing crits restore double HP. Base heal values are approximately 3× equivalent damage
ability bases, since heals must offset incoming damage rather than deal it.
Affected by: Intellect, Crit, Versatility, Haste (via cast time).

---

## Worked Examples at T2 (zone_level 0)

T2 is the base calibration tier; zone_level = 0, so no normalization applies.

Assume a fully T2-geared offensive character:
- Primary stat: 5,800 → Offensive Power: 11,600 → `primary_mult = 1 + 11600/K`
- Crit: ~22% (including 5% base)
- Haste: ~10% → effective GCD: 1.36s
- Versatility: ~8% → `versatility_mult = 1.08`

*(Until `K` is calibrated against playtested base ability damage values, treat `primary_mult`
as a placeholder. The formulas are correct; the constant needs tuning.)*

**Simple melee attack (base damage B):**
```
expected = B × primary_mult × 1.08 × 1.22
dps      = expected / 1.36
```

**DoT (base tick T, 1 tick/sec):**
```
expected_tick = T × primary_mult × 1.08 × 1.22  (crit snapshotted)
tick_rate     = 1.0 × 1.10 = 1.10/sec
dps           = expected_tick × 1.10
```
DoT gains more from Haste than a GCD-limited ability, since it increases tick rate
directly rather than just allowing more casts.

**Heal (base heal H):**
```
expected_heal = H × primary_mult × 1.08 × 1.22
hps           = expected_heal / 1.36
```
Base heal H is typically 3× the equivalent damage ability's base.

### Per-Stat Impact at T2

| Stat | +1 rating does | Notes |
|---|---|---|
| Primary stat (+1) | +2 Offensive Power, small % damage gain | % gain diminishes as stack grows |
| Stamina (+1) | +10 Max HP | Linear always |
| Crit (+1 rating) | +1/C % crit chance | ~0.05% per point at T2 |
| Haste (+1 rating) | +1/C % haste | Linear; GCD floor at 1.0s |
| Versatility (+1 rating) | +1/C % damage/healing, +0.5/C % dmg reduction | Never a dump stat |
| Resilience (+1 rating) | Armor multiplier increases | Essential for tanks; negligible for casters |
| Mastery (+1 rating) | Spec-dependent | Defined per class |

---

## Expected DPS by Tier

These ranges assume an appropriate-ilvl DPS character using a 3-4 ability rotation.
Numbers are in **zone-display scale** (what the player sees), so they feel larger at
higher tiers. Underlying gameplay ratios are identical when appropriately geared.

| Gear tier | Content tier | Relative power | Notes |
|---|---|---|---|
| T0 | T1 open world | Undergeared | Trainee gear; do quests |
| T1 | T2 dungeons | Undergeared | Viable with skill; upgrade priority |
| T2 | T2 dungeons | On-tier | Expected dungeon experience |
| T2 | T3 heroics | Undergeared | Same ratios as T1 in T2 |
| T3 | T3 heroics | On-tier | Expected heroic experience |
| T3 | T4 raids | Undergeared | Same ratios as T2 in T3 |
| T4 | T4 raids | On-tier | Expected raid experience |

Absolute DPS values depend on calibrated base ability damage; track these as a tuning
artifact once enemy health pools are established.

---

## Mastery

Mastery is the only class-specific stat. It does something different for every spec,
making two items with identical ilvl have different value depending on who equips them.
Effects are documented per class, not here.

Constraint: Mastery should affect *how* a spec plays - a multiplier on a specific
mechanic, resource generation, or cooldown behavior on a signature ability - not just a
flat damage multiplier. It should create a reason to play differently, not just hit harder.
