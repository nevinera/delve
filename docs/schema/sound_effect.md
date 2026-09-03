# SoundEffect

A SoundEffect describes an audio clip played when a power fires.

See [common.md](common.md#stock-asset-reference) for the `:name:` stock
asset syntax accepted by `sourceURL`.

## Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | no | | Optional label for editor display. |
| `sourceURL` | string | yes | | URL of the audio file, or a stock asset reference (see above). |
| `duration` | float | yes | | Clip duration in seconds. |
| `location` | string | yes | | Where the sound plays. `"self"` or `"affected"`. |
| `when` | string | yes | | Playback trigger. `"immediate"` or `"impact"`. |
| `condition` | string | yes | | When to play. `"always"`, `"onHit"`, or `"onMiss"`. |
| `impactTiming` | string | no | `"after"` | Only meaningful when `when` is `"impact"`. Controls when playback starts relative to impact time, based on this clip's `duration`: `"after"` starts playback at impact time; `"before"` schedules playback to *end* at impact time (starts immediately if there isn't enough travel time); `"centered"` schedules playback so its midpoint lands on impact time. |
| `volumeScale` | float | no | `1.0` | Playback volume multiplier. |
| `pitchScale` | float | no | `1.0` | Playback pitch multiplier. |

## Example

```json
{
  "name": "Bite",
  "sourceURL": "../../assets/interactions/sounds/bite.mp3",
  "duration": 0.2,
  "location": "self",
  "when": "immediate",
  "condition": "always",
  "volumeScale": 0.8
}
```
