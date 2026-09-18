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
| `worldLinks` | array of WorldLink | no | Connections between pairs of zone connection points (either an `openConnection` or an `entryPoint`) across zones in this world. |
| `entryPoints` | object | yes | Maps serialized WorldEntryPointIdentifier keys (`"zoneId/entryPointKey"`) to required key strings (or `null`). At least one. |

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
need to fetch every zone. `name`/`description` are always derived from the referenced zone's own
file, never authored by hand - the world editor fetches the zone and writes its current
`name`/`description` in here for you (and re-syncs them on refresh); it's cached content, not an
independent field to edit.

| Field | Type | Required | Notes |
|---|---|---|---|
| `path` | string | yes | Relative path to the zone's config file. |
| `name` | string | yes | Cached display name, kept in sync with the referenced zone's own `name`. |
| `description` | string | no | Cached description, kept in sync with the referenced zone's own `description`. |

---

## ZoneReference

A reference to a specific connection point on a specific zone within this world - either one of
that zone's own `openConnections` or one of its `entryPoints`. A zone's `entryPoints` are only
reachable directly when that zone is entered on its own; once it's part of a world, direct entry
happens only through the *world's* own `entryPoints` (see below) - so from the world's
perspective, a zone's `entryPoints` are just more available connection points, usable by a
`WorldLink` the same way an `openConnection` is.

| Field | Type | Required | Notes |
|---|---|---|---|
| `zone` | string | yes | Key into this world's `zones`. |
| `kind` | `"open"` \| `"entryPoint"` | yes | Which of the zone's connection pools `connection` addresses. |
| `connection` | string | yes | For `kind: "open"`, the zone's own `openConnections` value (its zone-level exposed name). For `kind: "entryPoint"`, one of the zone's own `entryPoints` keys (a raw `"mapId/connectionId"`, not an exposed name - entry points have no name). |

```json
{ "zone": "goblin_cave", "kind": "open", "connection": "cliff_above" }
```

---

## WorldEntryPointIdentifier

A reference to a specific one of a zone's own `entryPoints` - always `kind: "entryPoint"`, so
unlike `ZoneReference` there's nothing to disambiguate. When used as an object key (see `entryPoints`
above), serialized as `"zoneId/entryPointKey"`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `zone` | string | yes | Key into this world's `zones`. |
| `entryPoint` | string | yes | One of that zone's own `entryPoints` keys (a raw `"mapId/connectionId"`). |

```json
{ "zone": "stagnant_oasis", "entryPoint": "goblin_trailhead/clearing" }
```

---

## WorldLink

Links two zones' connection points (`openConnection` or `entryPoint`, see `ZoneReference`) so that
traversing one transports a unit to the other.

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
      "zoneA": { "zone": "goblin_cave", "kind": "open", "connection": "cliff_above" },
      "zoneB": { "zone": "stagnant_oasis", "kind": "open", "connection": "goblin_trailhead" },
      "oneWay": false,
      "requiredKey": null
    }
  ],
  "entryPoints": {
    "stagnant_oasis/clearing_entrance/clearing": null
  }
}
```
