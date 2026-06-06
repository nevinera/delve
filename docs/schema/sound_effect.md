# SoundEffect

A SoundEffect describes an audio clip played when a power fires.

## Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | no | | Optional label for editor display. |
| `sourceURL` | string | yes | | URL of the audio file. |
| `duration` | float | yes | | Clip duration in seconds. |
| `location` | string | yes | | Where the sound plays. `"self"` or `"affected"`. |
| `when` | string | yes | | Playback trigger. `"immediate"` or `"impact"`. |
| `condition` | string | yes | | When to play. `"always"`, `"onHit"`, or `"onMiss"`. |
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
