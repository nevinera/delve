# Zone

A Zone is a discrete location in the world, made up of one or more maps connected together.

See [common.md](common.md) for `Location`, `Position`, and `floatRange`.
See [map.md](map.md) for the `Map` type embedded in `maps`.

## Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Display name. |
| `description` | string | no | Short description shown in UI. |
| `private` | boolean | yes | `true` for party-instanced zones (dungeons); `false` for shared zones (questing areas). |
| `maps` | array of Map \| AssetReference(`referenceTo: "map"`) | yes | At least one. Inline Map objects or references to external map files. A zone containing any AssetReferences is abstract (see [common.md](common.md)). |
| `unitTypes` | object | no | Maps local string identifiers to UnitType definitions or AssetReferences (`referenceTo: "unit_type"`). Referenced by `unitType` fields on map Units. |
| `zoneLinks` | array of ZoneLink | no | Connections between pairs of MapConnections within this zone. |
| `entryPoints` | object | no | Maps `"mapId/connectionId"` keys to required key strings (or `null`). Players can spawn at these connections directly. |
| `openConnections` | object | no | Maps `"mapId/connectionId"` keys to zone-level name strings. Exposes connections for other zones to link against. |

> A zone must have at least one `entryPoint` or be reachable via an `openConnection` linked by another zone  -  otherwise there is no way for players to enter it.

---

## ConnectionIdentifier

A reference to a specific connection on a specific map within this zone. When used as an object key, serialized as `"mapId/connectionId"`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `map` | string | yes | The `identifier` of the map. |
| `connection` | string | yes | The `identifier` of the connection on that map. |

```json
{ "map": "ground_floor", "connection": "entrance" }
```

---

## ZoneLink

Links two MapConnections within the zone so that traversing one transports a unit to the other.

| Field | Type | Required | Notes |
|---|---|---|---|
| `connectionA` | ConnectionIdentifier | yes | |
| `connectionB` | ConnectionIdentifier | yes | |
| `oneWay` | boolean | yes | If `true`, travel is only permitted from `connectionA` to `connectionB`. |
| `requiredKey` | string \| null | yes | Identifier of the key item required to traverse. `null` if no key is needed. |

---

## Example (abstract)

`goblin-cave.json`  -  maps are referenced externally; a `goblin-cave.full.json` must exist alongside it.

```json
{
  "name": "Goblin Cave",
  "description": "A damp cave carved out by generations of goblin raiders.",
  "private": true,
  "unitTypes": {
    "goblin_raider": { "$ref": "./unit-types/goblin-raider.json", "referenceTo": "unit_type" }
  },
  "maps": [
    { "$ref": "./maps/goblin-cave-entrance-tunnel.json", "referenceTo": "map" },
    { "$ref": "./maps/goblin-cave-main-chamber.json", "referenceTo": "map" }
  ],
  "zoneLinks": [
    {
      "connectionA": { "map": "entrance_tunnel", "connection": "inner_door" },
      "connectionB": { "map": "main_chamber", "connection": "inner_door" },
      "oneWay": false,
      "requiredKey": null
    }
  ],
  "entryPoints": {
    "entrance_tunnel/cave_mouth": null
  },
  "openConnections": {
    "main_chamber/landing_site": "cliff_above"
  }
}
```

## Example (concrete)

`goblin-cave.full.json`  -  all maps inlined.

```json
{
  "name": "Goblin Cave",
  "description": "A damp cave carved out by generations of goblin raiders.",
  "private": true,
  "unitTypes": {
    "goblin_raider": {
      "name": "Goblin Raider",
      "description": "A scrappy goblin that slashes anything within reach.",
      "tokenImageUrl": [
        "../../assets/tokens/goblin-green.webp",
        "../../assets/tokens/goblin-brown.webp"
      ],
      "tokenRadius": 1.5,
      "speedFactor": 1.2,
      "maxHP": 20,
      "resource": {
        "name": "energy",
        "color": "AADD00",
        "max": 100.0,
        "defaultValue": 100.0,
        "returnRate": 10.0,
        "isFluid": true
      },
      "targeting": { "type": "nearest" },
      "tactics": { "type": "rotation", "powers": ["Slash"] },
      "powers": [
        {
          "name": "Slash",
          "description": "A quick slash at the target.",
          "maxRange": 5.0,
          "castTime": null,
          "globalCooldown": 1.0,
          "costType": "energy",
          "costAmount": 40.0,
          "effects": [
            {
              "type": "harm",
              "affects": "bTarget",
              "range": 5.0,
              "amount": [2.0, 4.0],
              "tags": ["physical", "melee"]
            }
          ]
        }
      ]
    }
  },
  "maps": [
    {
      "identifier": "entrance_tunnel",
      "name": "Entrance Tunnel",
      "imageUrl": "../../assets/maps/goblin-cave-entrance.png",
      "pixelDimensions": { "width": 1024, "height": 768 },
      "feetDimensions": { "width": 30.0, "height": 22.5 },
      "barriers": [
        {
          "type": "wall",
          "locations": [
            { "x": 0.0, "y": 0.0 }, { "x": 30.0, "y": 0.0 },
            { "x": 30.0, "y": 22.5 }, { "x": 0.0, "y": 22.5 },
            { "x": 0.0, "y": 0.0 }
          ]
        }
      ],
      "connections": [
        {
          "identifier": "cave_mouth",
          "type": "line",
          "start": { "x": 8.0, "y": 0.0 },
          "end": { "x": 12.0, "y": 0.0 }
        },
        {
          "identifier": "inner_door",
          "type": "line",
          "start": { "x": 14.0, "y": 22.5 },
          "end": { "x": 16.0, "y": 22.5 }
        }
      ],
      "units": [
        {
          "unitType": "goblin_raider",
          "position": { "x": 15.0, "y": 10.0, "angle": 180.0 },
          "hostility": "hostile",
          "identifier": "raider_a",
          "links": ["raider_b"],
          "movement": {
            "type": "patrol",
            "choose": "return",
            "steps": [
              { "position": { "x": 15.0, "y": 8.0, "angle": 180.0 }, "movementRate": 0.4, "waitTime": 3.0 },
              { "position": { "x": 15.0, "y": 18.0, "angle": 0.0 }, "movementRate": 0.4, "waitTime": 3.0 }
            ]
          }
        },
        {
          "unitType": "goblin_raider",
          "position": { "x": 20.0, "y": 10.0, "angle": 180.0 },
          "hostility": "hostile",
          "identifier": "raider_b",
          "links": ["raider_a"],
          "movement": { "type": "wander", "location": { "x": 20.0, "y": 10.0 }, "radius": 5.0, "speed": 0.3, "waitTime": [2.0, 5.0] }
        }
      ]
    },
    {
      "identifier": "main_chamber",
      "name": "Main Chamber",
      "imageUrl": "../../assets/maps/goblin-cave-main.png",
      "pixelDimensions": { "width": 2048, "height": 1536 },
      "feetDimensions": { "width": 60.0, "height": 45.0 },
      "barriers": [],
      "connections": [
        {
          "identifier": "inner_door",
          "type": "line",
          "start": { "x": 28.0, "y": 0.0 },
          "end": { "x": 32.0, "y": 0.0 }
        },
        {
          "identifier": "landing_site",
          "type": "point",
          "position": { "x": 30.0, "y": 40.0, "angle": 180.0 },
          "fuzzRadius": 3.0,
          "fuzzAngle": 60.0
        }
      ]
    }
  ],
  "zoneLinks": [
    {
      "connectionA": { "map": "entrance_tunnel", "connection": "inner_door" },
      "connectionB": { "map": "main_chamber", "connection": "inner_door" },
      "oneWay": false,
      "requiredKey": null
    }
  ],
  "entryPoints": {
    "entrance_tunnel/cave_mouth": null
  },
  "openConnections": {
    "main_chamber/landing_site": "cliff_above"
  }
}
```
