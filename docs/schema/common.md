# Common Types

Shared types referenced across multiple schemas.

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

A two-element array `[min, max]` representing a range of values with two endpoints.

```json
[2.0, 4.0]
```
