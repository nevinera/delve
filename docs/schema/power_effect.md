# PowerEffect

A PowerEffect describes a single mechanical outcome applied when a power fires.

## Common Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | Discriminator. See types below. |
| `tags` | array of strings | no | Max 24 tags; each at most 16 characters. |

`float | floatRange` fields accept either a single float or a floatRange (see [common.md](common.md)). When used for amounts, the value drawn is determined by the game server (typically random within the range).

### Affects Values

Used by several effect types:

| Value | Meaning |
|---|---|
| `bTarget` | A single selected hostile target |
| `gTarget` | A single selected friendly target |
| `bAll` | All hostile units within range |
| `gAll` | All friendly units within range |
| `self` | The unit using the power |

---

## harm

Deals damage to one or more targets.

| Field | Type | Required | Notes |
|---|---|---|---|
| `affects` | string | yes | Must not be `"self"`. |
| `amount` | float \| floatRange | yes | Damage dealt. |
| `range` | float \| floatRange | yes | Distance in feet to a valid target. |

### Example

```json
{
  "type": "harm",
  "affects": "bTarget",
  "range": 5.0,
  "amount": [2.0, 4.0],
  "tags": ["physical", "melee"]
}
```

---

## heal

Restores HP to one or more targets.

| Field | Type | Required | Notes |
|---|---|---|---|
| `affects` | string | yes | |
| `amount` | float \| floatRange | yes | HP restored. |
| `range` | float \| floatRange | unless `affects` is `"self"` | Distance in feet to a valid target. |

### Example

```json
{
  "type": "heal",
  "affects": "self",
  "amount": [3.0, 5.0],
  "tags": ["magic"]
}
```

---

## resource

Modifies a named resource on one or more targets.

| Field | Type | Required | Notes |
|---|---|---|---|
| `affects` | string | yes | |
| `resourceName` | string | yes | Name of the resource to modify (must match the target's resource `name`). |
| `delta` | float | yes | Amount added to the resource. Negative values consume it. |
| `range` | float \| floatRange | unless `affects` is `"self"` | Distance in feet to a valid target. |

### Example

```json
{
  "type": "resource",
  "affects": "self",
  "resourceName": "fury",
  "delta": 3.0,
  "tags": ["melee"]
}
```
