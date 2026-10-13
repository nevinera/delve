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
| `thumbnailUrl` | string | no | URL of a small preview image, shown in world-selection UI. Relative to the world file; the world editor uploads it as a sibling `<world>.thumb.webp`. |
| `elevationRange` | ElevationRange | no | Recommended. Bounds the `elvl` of every zone (and transitively every map) within this world. |
| `zones` | object | yes | Maps local zone-identifier strings to WorldZoneEntry. At least one. |
| `worldLinks` | array of WorldLink | no | Connections between pairs of zone connection points (either an `openConnection` or an `entryPoint`) across zones in this world. |
| `provenanceRestrictions` | ProvenanceRestrictions | no | Which worlds' items (and up to what elevation) may be worn here. See [common.md](common.md#provenancerestrictions). Default: this world's items only, any elevation. |
| `questsPath` | string | no | Path to this world's quests file (a JSON array of [Quests](quest.md)), relative to the world file. Default: `./quests.json`, and a world with nothing there has no quests. |
| `entryPoints` | object | yes | Maps serialized WorldEntryPointIdentifier keys (`"zoneId/entryPointKey"`) to required key strings (or `null`). At least one. |
| `atlas` | Atlas | no | Where the zones' maps sit geographically, for the in-game map. Published to the client only; the game server ignores it. See **Atlas** below. |
| `annotations` | Annotations | no | Notes for an LLM (and the author): intent, plans, backstory, personality. Never read at runtime, and never copied into game state. See [common.md](common.md#annotations). |

> Skipped for now, tracked separately: `allowedClasses` (blocked on ClassSets).

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

## Atlas

Lays the world's maps out geographically, for the in-game map: each zone an outline, its maps
placed inside it. Everything is in world feet, x east and y north (as on a map), so maps are
drawn to scale, and always north-up. The world editor makes a first guess from the links and
lets you drag maps, outline corners and link bends from there.

| Field | Type | Required | Notes |
|---|---|---|---|
| `zones` | object | yes | Maps zone keys (from `zones`) to AtlasZone. A zone left out isn't laid out yet. |
| `bends` | object | no | Curves for links between maps, keyed by the link's two ends: `"zone/map/connection"` each, sorted, joined by `\|` (a zoneLink's ends are in its zone; a worldLink's are the maps and connections its sides resolve to). Each value is a Location: an offset in feet from the midpoint of the straight line between the two connections, which the curve passes through (a quadratic curve, its control point at twice that point less the midpoint). A link with no bend is straight; a bend for no link is ignored. |

An **AtlasZone**:

| Field | Type | Required | Notes |
|---|---|---|---|
| `outline` | array of Location | yes | 3 to 64 points: a polygon around the zone's maps, any shape that doesn't cross or touch itself. |
| `maps` | object | yes | Maps the zone's map identifiers to the Location of each map's origin, its own (0, 0), in world feet. A map spans its `feetDimensions` east and north from there. A map left out isn't laid out yet. |

Every placed map must lie inside its zone's outline. Maps may touch but never overlap, in a zone
or across zones, and neither may outlines.

```json
"atlas": {
  "zones": {
    "goblin_cave": {
      "outline": [{"x": 0, "y": 0}, {"x": 400, "y": 0}, {"x": 400, "y": 400}, {"x": 0, "y": 400}],
      "maps": {"entrance": {"x": 0, "y": 0}, "depths": {"x": 200, "y": 0}}
    }
  },
  "bends": {"goblin_cave/depths/west|goblin_cave/entrance/east": {"x": 0, "y": 40}}
}
```

---

## Example

`northern-barrens.json`

```json
{
  "name": "Northern Barrens",
  "description": "A dusty region of quillboar mountains, oases, and goblin outposts.",
  "thumbnailUrl": "northern-barrens.thumb.webp",
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
  "questsPath": "./northern-barrens.quests.json",
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
