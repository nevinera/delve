# Map

A Map is one visual floor or area within a Zone. A zone contains at least one map.

See [common.md](common.md) for `Location`, `Position`, and `floatRange`.

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `identifier` | string | yes | Slug used to reference this map within the zone (e.g. `"ground_floor"`). |
| `name` | string | yes | Display name (e.g. `"Ground Floor"`). |
| `imageUrl` | string | yes | URL of the map background image. |
| `pixelDimensions` | object | yes | Image dimensions in pixels: `{ "width": int, "height": int }`. |
| `feetDimensions` | object | yes | Map dimensions in feet: `{ "width": float, "height": float }`. Used to convert pixel coordinates to world coordinates. |
| `barriers` | array of Barrier | no | Impassable obstacles on this map. |
| `connections` | array of MapConnection | no | Entry/exit points on this map. The zone defines how connections pair up and which are entry points. |
| `units` | array of Unit | no | Units initially present on this map. See [unit.md](unit.md). UnitType keys must be defined in the enclosing zone's `unitTypes`. |

---

## Barrier

Barriers block unit movement and line-of-sight.

### wall

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `"wall"` | yes | |
| `locations` | array of Location | yes | At least two points. Adjacent points are joined into wall segments. |

```json
{
  "type": "wall",
  "locations": [
    { "x": 0.0, "y": 0.0 },
    { "x": 10.0, "y": 0.0 },
    { "x": 10.0, "y": 15.0 }
  ]
}
```

### circle

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `"circle"` | yes | |
| `location` | Location | yes | Center of the circle. |
| `radius` | float | yes | Radius in feet. Maximum 30.0. |

```json
{
  "type": "circle",
  "location": { "x": 25.0, "y": 40.0 },
  "radius": 5.0
}
```

---

## MapConnection

Connections are entry/exit points used to move between maps or enter the zone.

### Common Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `identifier` | string | yes | Slug used to reference this connection within the zone (e.g. `"landing_site"`). |
| `type` | string | yes | `"point"` or `"line"`. |

### point

A positional trigger. Units departing via this connection must intersect `position`. Units arriving via this connection are placed randomly within `fuzzRadius` feet and `fuzzAngle` degrees of `position`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `position` | Position | yes | Location and facing direction of the connection point. |
| `fuzzRadius` | float | yes | Arrival scatter radius in feet. Range: 0.0-20.0. |
| `fuzzAngle` | float | yes | Arrival scatter angle in degrees. Range: 0.0-360.0. |

```json
{
  "identifier": "landing_site",
  "type": "point",
  "position": { "x": 12.0, "y": 8.0, "angle": 270.0 },
  "fuzzRadius": 2.0,
  "fuzzAngle": 90.0
}
```

### line

A threshold. Units crossing the line segment activate the connection.

| Field | Type | Required | Notes |
|---|---|---|---|
| `start` | Location | yes | One end of the threshold line. |
| `end` | Location | yes | Other end of the threshold line. |

```json
{
  "identifier": "north_door",
  "type": "line",
  "start": { "x": 8.0, "y": 20.0 },
  "end": { "x": 12.0, "y": 20.0 }
}
```

---

## Example

```json
{
  "identifier": "ground_floor",
  "name": "Ground Floor",
  "imageUrl": "../../assets/maps/goblin-cave-ground.png",
  "pixelDimensions": { "width": 2048, "height": 1536 },
  "feetDimensions": { "width": 60.0, "height": 45.0 },
  "barriers": [
    {
      "type": "wall",
      "locations": [
        { "x": 0.0, "y": 0.0 },
        { "x": 60.0, "y": 0.0 },
        { "x": 60.0, "y": 45.0 },
        { "x": 0.0, "y": 45.0 },
        { "x": 0.0, "y": 0.0 }
      ]
    },
    {
      "type": "circle",
      "location": { "x": 30.0, "y": 22.5 },
      "radius": 4.0
    }
  ],
  "connections": [
    {
      "identifier": "landing_site",
      "type": "point",
      "position": { "x": 50.0, "y": 38.0, "angle": 0.0 },
      "fuzzRadius": 1.5,
      "fuzzAngle": 120.0
    },
    {
      "identifier": "entrance",
      "type": "line",
      "start": { "x": 8.0, "y": 0.0 },
      "end": { "x": 12.0, "y": 0.0 }
    }
  ]
}
```
