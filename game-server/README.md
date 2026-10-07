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
| `quests_url`, `quests_sha` | instance | The world's quests file and its SHA1. Fetched once per URL and cached; if it can't be read, the zone offers no quests. |
| `spawn_at` | slot | `"mapId/connectionId"` to spawn at; unknown keys fall back to the default entry position. |
| `world_character_database_id` | slot | Required for `world`; sent to Rails when the player exits. |
| `held_flags` | slot | The zone config's `flags` the character holds. The slot caches these, asks Rails about any other flag when needed, and grants `zone/reached/<zone>` on connect. See `docs/flags.md`. |
| `active_quests` | slot | The character's active quests in the world, as Rails stores them (`{quest_identifier, timer_elapsed_seconds, progress}`). |

"Instance" fields are taken from the request that starts the instance.

**Exits.** A world-mode player exits by stepping onto an exit: not by spawning on one or standing
on one, and not within 6 seconds of spawning. The server posts
`{zone_identifier, connection}` to Rails at `/internal_api/world_characters/{id}/zone_exits`.
- On success, the client gets `zone-exit` (`{connection}`), its slot is removed, and the socket
  closes.
- On failure, the client gets `zone-exit-failed` (`{error}`), and the 6 seconds start again.

**Quests.** The client keeps its own quest log (read from Rails on load); the server sends it
events as quests change.
- In a zone where an NCU offers quests, a world-mode player gets `quest-offers`
  (`{offers: {ncuIdentifier: [questIdentifier]}}`) on connect: the quests they aren't on, haven't
  completed, and hold every `requiresFlags` flag for.
- On connect, any active quest from an older world version is synced to this version's definition
  through Rails (`quest-updated`, `{quest}`), or abandoned if this version doesn't have it
  (`quest-abandoned`, `{quest}`).
- The client sends `talk` (`{ncu_id}`, the NCU's state id) whenever it opens a conversation; the
  server checks the player is alive and within talk range (10 feet between token edges), and
  resends their offers.
- The client sends `accept_quest` (`{ncu_id, quest}`). If that NCU offers it to them, the server
  accepts it through Rails, sending the quest's definition (`/internal_api/world_characters/{id}/quests`);
  the client gets `quest-received` (`{quest}`, as Rails stores it) and new offers, or
  `quest-accept-failed` (`{quest, error}`).
- The client sends `abandon_quest` (`{quest}`); the server ends it through Rails and sends
  `quest-abandoned` and new offers, or `quest-abandon-failed` (`{quest, error}`).
- Objectives in this zone progress as the player meets them: `talk` when they start a
  conversation, `kill` when a unit they tagged dies, `reach` when they arrive on a map (or spawn
  on it). Each is saved through Rails (PATCH) and sent as `quest-progress`
  (`{quest, objective, count}`, the objective by hash).
- A quest with no `turnIn` completes once every objective is met. One with a `turnIn` completes
  when the client sends `turn_in_quest` (`{ncu_id, quest}`) to that NCU, in talk range, or gets
  `quest-turn-in-failed` (`{quest, error}`). Rails grants its completion flag, `grantsFlags` and
  rewards; the client gets `quest-completed` (`{quest, flags, items}`, items by name) and new
  offers.
- A timed quest's timer runs only while the player is connected to a zone in that world. It's
  saved every 15 seconds and on disconnect; when it runs out the quest is abandoned through Rails
  and the client gets `quest-failed` (`{quest}`) and new offers.

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
