# game-server

Go HTTP server for the Delve MMO. Manages game instances (zones), handles WebSocket connections from clients, and runs per-instance game loops.

## Running

```sh
cd game-server
go run .
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `8080`  | Port to listen on |
| `DEBUG`  | `false` | Enable debug-level logging |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/status.json` | Server health and instance count |
| `POST` | `/slots/request` | Join a zone: find or start an instance and reserve a slot (Bearer auth) |
| `POST` | `/world-versions/{id}/expire` | Start the expiry countdown on every instance of a world version (Bearer auth) |

## World and direct joins

Every slot request says how the player reached the zone (`mode`), along with these fields:

| Field | Scope | Meaning |
|---|---|---|
| `mode` | instance | Required. `world` (through a world; loot persists) or `direct` (a builder trying a zone; nothing persists, no `database_id` needed). |
| `instance_key` | instance | Required. Chosen by Rails; a request only joins an instance with the same mode and key. |
| `exits` | instance | `"mapId/connectionId"` keys of connections that leave the zone. |
| `world_version_id` | instance | Lets `/world-versions/{id}/expire` find the instance. |
| `provenance_restrictions` | instance | `{world_key, layers}`: equipped items that fail any layer (by their `world_key` and `elvl`) are ignored, not worn. See `docs/schema/common.md#provenancerestrictions`. |
| `expires_at` | instance | RFC 3339; set when the version is already expiring. |
| `spawn_at` | slot | `"mapId/connectionId"` to spawn at; unknown keys fall back to the default entry position. |
| `world_character_database_id` | slot | Required for `world`; sent to Rails when the player exits. |
| `held_flags` | slot | The zone config's `flags` the character holds. The slot caches these, asks Rails about any other flag when needed, and grants `zone/reached/<zone>` on connect. See `docs/flags.md`. |

"Instance" fields are taken from the request that starts the instance.

**Exits.** A world-mode player exits by stepping onto an exit: not by spawning on one or standing
on one, and not within 6 seconds of spawning. The server posts
`{zone_identifier, connection}` to Rails at `/internal_api/world_characters/{id}/zone_exits`.
- On success, the client gets `zone-exit` (`{connection}`), its slot is removed, and the socket
  closes.
- On failure, the client gets `zone-exit-failed` (`{error}`), and the 6 seconds start again.

**Expiry.** For the last 10 minutes before `expires_at`, every player gets `version-expiring`
(`{expires_at, minutes_remaining}`) once a minute. At expiry they get `version-expired`, every
slot is removed, and the instance stops. Full-state messages include `expires_at` while one is
set.

**Leaving.** Removing a slot (an exit, expiry, pruning, or `DELETE`) also removes the
character's unit from the zone on the next tick.

## Testing

```sh
cd game-server
go test ./...
```
