# GraphicEffect

A GraphicEffect describes a visual played when a power fires.

## Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | no | | Optional label for editor display. |
| `sourceURL` | string | yes | | URL of the image or animation file. |
| `duration` | float | yes | | Display duration in seconds. |
| `from` | string | yes | | Origin location. `"self"` or `"affected"`. |
| `to` | string | no | | Destination location. `"self"` or `"affected"`. If present, the graphic travels from `from` to `to`. |
| `when` | string | yes | | Display trigger. `"immediate"` or `"impact"`. |
| `condition` | string | yes | | When to display. `"always"`, `"onHit"`, or `"onMiss"`. |
| `scale` | float | no | `1.0` | Size multiplier. |
| `opacity` | float | no | `1.0` | Opacity, from `0.0` (invisible) to `1.0` (fully opaque). |

## Examples

### Static (plays at affected unit)

```json
{
  "name": "Bite",
  "sourceURL": "../../assets/interactions/images/bite.webp",
  "duration": 0.2,
  "from": "affected",
  "when": "immediate",
  "condition": "onHit"
}
```

### Travelling (projectile from caster to target)

```json
{
  "name": "Arrow",
  "sourceURL": "../../assets/interactions/images/arrow.webp",
  "duration": 0.3,
  "from": "self",
  "to": "affected",
  "when": "immediate",
  "condition": "always",
  "scale": 0.5
}
```
