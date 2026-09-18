# World

A World is a collection of Zones and the links between them, plus the bounds on elevation that
zones (and their maps) within it must respect. Unlike a Zone, a World never inlines its children -
zones are always referenced by relative path, never embedded, so a World has no abstract/concrete
(`.full.json`) split.

See [zone.md](zone.md) for the `Zone` type referenced by `zones`.

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Display name. |
| `description` | string | no | Short description shown in UI. |
| `thumbnailUrl` | string | no | URL of a small preview image, shown in world-selection UI. |
| `elevationRange` | ElevationRange | no | Recommended. Bounds the `elvl` of every zone (and transitively every map) within this world. |
| `zones` | object | yes | Maps local zone-identifier strings to WorldZoneEntry. At least one. |
| `worldLinks` | array of WorldLink | no | Connections between pairs of zone `openConnections` across zones in this world. |
| `entryPoints` | object | yes | Maps zone-identifier strings (keys of `zones`) to required key strings (or `null`). At least one. |

> Skipped for now, tracked separately: `allowedClasses` (blocked on ClassSets) and equipment
> provenance restrictions (issue #79).

---

## ElevationRange

A two-element array `[min, max]` of integers bounding elevation (see [stats.md](../stats.md)).
Both values must be at least 0, and `min` must not exceed `max`.

```json
[0, 800]
```

---

## WorldZoneEntry

A reference to a Zone's own config file, plus cached display fields so world-selection UI doesn't
need to fetch every zone.

| Field | Type | Required | Notes |
|---|---|---|---|
| `path` | string | yes | Relative path to the zone's config file. |
| `name` | string | yes | Cached display name (should match the referenced zone's own `name`). |
| `description` | string | no | Cached description (should match the referenced zone's own `description`). |

---

## ZoneReference

A reference to a specific `openConnection` on a specific zone within this world. When used as an
object key, serialized as `"zoneId/connectionName"`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `zone` | string | yes | Key into this world's `zones`. |
| `connection` | string | yes | Key into that zone's own `openConnections` (the zone-level name, not a raw `"mapId/connectionId"`). |

```json
{ "zone": "goblin_cave", "connection": "cliff_above" }
```

---

## WorldLink

Links two zones' exposed `openConnections` so that traversing one transports a unit to the other.

| Field | Type | Required | Notes |
|---|---|---|---|
| `zoneA` | ZoneReference | yes | |
| `zoneB` | ZoneReference | yes | |
| `oneWay` | boolean | yes | If `true`, travel is only permitted from `zoneA` to `zoneB`. |
| `requiredKey` | string \| null | yes | Identifier of the key item required to traverse. `null` if no key is needed. |

---

## Example

`northern-barrens.json`

```json
{
  "name": "Northern Barrens",
  "description": "A dusty region of quillboar mountains, oases, and goblin outposts.",
  "thumbnailUrl": "../../assets/worlds/northern-barrens-thumb.webp",
  "elevationRange": [0, 800],
  "zones": {
    "goblin_cave": {
      "path": "./zones/goblin-cave.json",
      "name": "Goblin Cave",
      "description": "A damp cave carved out by generations of goblin raiders."
    },
    "stagnant_oasis": {
      "path": "./zones/stagnant-oasis.json",
      "name": "Stagnant Oasis",
      "description": "A murky watering hole ringed by dead trees."
    }
  },
  "worldLinks": [
    {
      "zoneA": { "zone": "goblin_cave", "connection": "cliff_above" },
      "zoneB": { "zone": "stagnant_oasis", "connection": "goblin_trailhead" },
      "oneWay": false,
      "requiredKey": null
    }
  ],
  "entryPoints": {
    "stagnant_oasis": null
  }
}
```
