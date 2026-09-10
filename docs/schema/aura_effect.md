# AuraEffect

An AuraEffect describes a persistent visual attached to a unit for as long as
a [Status](status.md) is active on it - a thorns aura, a shield glow. Distinct
from [GraphicEffect](graphic_effect.md), which is a fixed-duration
cast/impact effect: an AuraEffect has no duration of its own (its lifetime is
the status's own remaining duration), no origin/destination (it's always
centered on the unit holding the status), and no display trigger/condition
(it's simply visible for as long as the status is active). Its rendered size
scales with the unit's own token radius as well as `scale`.

See [common.md](common.md#stock-asset-reference) for the `:name:` stock
asset syntax accepted by `sourceURL`.

## Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | no | | Optional label for editor display. |
| `sourceURL` | string | yes | | URL of the image or animation file, or a stock asset reference (see above). |
| `scale` | float | no | `1.0` | Size multiplier, applied on top of the holder's own token radius. |
| `opacity` | float | no | `1.0` | Opacity, from `0.0` (invisible) to `1.0` (fully opaque). |
| `color` | Color | no | | Optional color tint applied to the image (see [common.md](common.md#color)). If omitted, no tint is applied. |
| `spriteColumns` | integer | no | | Number of columns in a sprite-sheet grid. Required together with `spriteRows` to enable sprite-sheet animation. |
| `spriteRows` | integer | no | | Number of rows in a sprite-sheet grid. Required together with `spriteColumns` to enable sprite-sheet animation. |
| `spriteFrameCount` | integer | no | `spriteColumns * spriteRows` | Number of frames to play, in case the grid has trailing unused cells. Only meaningful with `spriteColumns`/`spriteRows`. |
| `spriteFrameRate` | float | no | `8` | Sprite-sheet playback rate, in frames per second. Loops for as long as the status is active. Only meaningful with `spriteColumns`/`spriteRows`. |

## Example

```json
{ "sourceURL": "../../graphics/effects/shield-aura.webp", "scale": 1.1, "opacity": 0.7 }
```
