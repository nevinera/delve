# Common Types

Shared types referenced across multiple schemas.

---

## AssetReference

A pointer to an external config file rather than an inline definition. Any config containing one or more AssetReferences is considered **abstract** and must have a companion **concrete** config at the same path with `.full.json` substituted for `.json` (e.g. `goblin-cave.json` -> `goblin-cave.full.json`), in which all references are resolved to inline definitions.

| Field | Type | Required | Notes |
|---|---|---|---|
| `$ref` | string | yes | Relative path to the referenced config file. |
| `referenceTo` | string | yes | Asset type: `"map"`, `"zone"`, `"unit_type"`, `"ability"`, etc. |

```json
{ "$ref": "../maps/main-chamber.json", "referenceTo": "map" }
```

---

## Stock asset reference

Fields that normally hold a relative URL to an image or audio file in the
content repo (`iconURL`, and `sourceURL` on GraphicEffect/SoundEffect) may
instead hold a name wrapped in colons, e.g. `":arc:"` or `":helix-beam:"`,
referring to a built-in asset hosted by the game server itself under
`public/abilities/{icons,graphics,sounds}` rather than anything in the
author's own repo. This is meant for content authors who don't want to
supply their own art/audio for every ability. The set of recognized names is
defined server-side (see `Content::StockAssets`) and enforced by the
relevant validator - an unrecognized name is a validation error, not a
broken link. Picking a stock graphic/sound may also pre-fill related fields
(`spriteColumns`/`spriteRows` for an animated graphic, `duration` for a
sound) with values appropriate to that asset.

---

## Color

A 6-digit hexadecimal color, an optional leading `#` followed by exactly 6
hex digits (`0-9`, `a-f`/`A-F`). Named CSS colors (e.g. `"red"`) aren't
supported yet.

```json
"AA2200"
```

```json
"#AA2200"
```

---

## Location

A point in map coordinates (feet).

| Field | Type | Required | Notes |
|---|---|---|---|
| `x` | float | yes | Distance east from the map origin. |
| `y` | float | yes | Distance north from the map origin. |

```json
{ "x": 10.0, "y": 25.0 }
```

---

## Position

A point in map coordinates with a facing direction.

| Field | Type | Required | Notes |
|---|---|---|---|
| `x` | float | yes | Distance east from the map origin. |
| `y` | float | yes | Distance north from the map origin. |
| `angle` | float | yes | Facing direction in degrees. 0 = north, clockwise positive. |

```json
{ "x": 10.0, "y": 25.0, "angle": 180.0 }
```

---

## floatRange

A two-element array `[min, max]` representing a range of values with two endpoints. A single float is also accepted and treated as `[value, value]` (no variance).

```json
[2.0, 4.0]
```

## rangeFloat

Used specifically for distance/range fields (e.g. `range` on PowerEffect, `radius` on wander movement). Accepts a single float or a `[min, max]` pair, but a single float `x` is treated as `[0, x]` rather than `[x, x]`. This allows the game server to select a random distance from zero up to `x`.

```json
5.0
```

---

## RespawnConfig

Controls whether a dead unit comes back. Settable on [Zone](zone.md), [Map](map.md), and [Unit](unit.md) - the most specific one present wins (Unit, then Map, then Zone), independent of whether the less-specific levels set anything. Absent at all three levels means no respawn - that's the default, not something a value has to opt into.

Once `delaySeconds` after death has passed, the unit doesn't just reappear: it teleports to its spawn point and spends a few (randomized) seconds visibly "respawning" - present, but not targetable and not yet acting - before it's truly back at full health.

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | `"none"` or `"timer"`. |
| `delaySeconds` | float | for `"timer"` | Seconds from death until the unit starts visibly respawning. Must be >= 0. |

```json
{ "type": "timer", "delaySeconds": 120.0 }
```
