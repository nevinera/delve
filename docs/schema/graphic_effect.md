# GraphicEffect

A GraphicEffect describes a visual played when a power fires.

See [common.md](common.md#stock-asset-reference) for the `:name:` stock
asset syntax accepted by `sourceURL`.

## Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | no | | Optional label for editor display. |
| `sourceURL` | string | yes | | URL of the image or animation file, or a stock asset reference (see above). |
| `duration` | float | yes | | Display duration in seconds. |
| `from` | string | yes | | Origin location. `"self"` or `"affected"`. |
| `to` | string | no | | Destination location. `"self"` or `"affected"`. If present, the graphic travels from `from` to `to`. |
| `when` | string | yes | | Display trigger. `"immediate"` or `"impact"`. |
| `condition` | string | yes | | When to display. `"always"`, `"onHit"`, or `"onMiss"`. |
| `scale` | float | no | `1.0` | Size multiplier. |
| `opacity` | float | no | `1.0` | Opacity, from `0.0` (invisible) to `1.0` (fully opaque). |
| `color` | Color | no | | Optional color tint applied to the image (see [common.md](common.md#color)). If omitted, no tint is applied. |
| `spriteColumns` | integer | no | | Number of columns in a sprite-sheet grid. Required together with `spriteRows` to enable sprite-sheet animation. |
| `spriteRows` | integer | no | | Number of rows in a sprite-sheet grid. Required together with `spriteColumns` to enable sprite-sheet animation. |
| `spriteFrameCount` | integer | no | `spriteColumns * spriteRows` | Number of frames to play, in case the grid has trailing unused cells. Only meaningful with `spriteColumns`/`spriteRows`. |
| `spriteFrameRate` | float | no | `8` | Sprite-sheet playback rate, in frames per second. Runs independently of `duration` and loops for as long as the effect is displayed. Only meaningful with `spriteColumns`/`spriteRows`. |

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
