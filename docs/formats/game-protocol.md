# The game protocol

The play page talks to the Go game server (`game-server/`) over a websocket. The game server owns every character's state in a world. The browser sends what its player does, and the server tells it what everyone nearby does.

## Entering

1. The play page gets an entry token from Rails, in its config with the game server's address.
2. The client opens `wss://<game server>/play?token=<token>`. A browser websocket can't set headers, so the token goes in the URL.
3. The game server checks the token's signature and expiry, loads the world, asks Rails for the character, and places it.

A token lasts 5 minutes. To enter again after that, reload the page.

### Entry tokens

A token is `<payload>.<signature>`, both base64url without padding. The payload is JSON:

```json
{ "user": 7, "character": 12, "world": 3, "repo": "owner/name", "sha": "<released commit>", "exp": 1798000000 }
```

`exp` is in Unix seconds. The signature is HMAC-SHA256 of the payload's base64url text, keyed with `GAME_TOKEN_SECRET`, which Rails and the game server share.

## Placing a character

- The game server keeps each released commit's zip on disk, keyed by repo and sha, and downloads it from GitHub the first time someone enters it. A world stays in memory while it has players, and unloads a few minutes after the last one leaves.
- Rails gives the character's last position in the world, or none. With none, the character starts at the world's spawn pin. A character still connected elsewhere in the same layer keeps where it is there.
- The open world runs as layers (copies). The server puts each entering character on a layer. For now each world has one.

## Messages

Each websocket message is a JSON text frame, `{ "type": ..., ... }`. Positions are continent feet `[x, y, z]` (x east, z south, y up), and `yaw` is radians, 0 facing +z.

### Client to server

| type | fields | sent |
|---|---|---|
| `move` | `at`, `yaw`, `move` | whenever its movement changes: starting, stopping, turning, jumping, changing gait |
| `heartbeat` | `at`, `yaw` | twice a second while moving or turning, once a second otherwise |

`move` is how the character is moving, so others can carry it on between messages:

```json
{ "forward": 1, "strafe": 0, "turn": -1, "gait": "run", "swim": false, "jump": false }
```

`forward` and `strafe` are -1, 0 or 1 (strafe 1 is left), `turn` is -1 (right), 0 or 1 (left), `gait` is `walk`, `run` or `sprint`, and `jump` is true in the message sent as it leaves the ground.

### Server to client

| type | fields | sent |
|---|---|---|
| `welcome` | `you` (a character), `layer` | once, on entering |
| `snapshot` | `characters` | once, after `welcome`: everyone near you |
| `appear` | `character` | someone comes near you |
| `vanish` | `id` | someone leaves your area, or the game |
| `moved` | `id`, `at`, `yaw`, `move` | someone near you sent `move` or `heartbeat` |
| `error` | `message` | before the server closes the connection |

A character is `{ id, name, look, continent, at, yaw, move }`. `look` is the character builder's look.

"Near you" is the 3×3 tiles around your tile, on your continent and layer.

## Rails and the game server

They call each other with fixed shared tokens in an `X-Internal-Token` header. Rails accepts the ones in `INTERNAL_API_TOKENS`, and the game server sends `RAILS_INTERNAL_TOKEN`.

- `GET /internal/worlds/:world/characters/:character` gives `{ id, name, look, position }`, `position` being `{ continent, at, yaw }` or null.
- `PUT /internal/worlds/:world/characters/:character/position` with `{ continent, at, yaw }` keeps where the character is in that world (a `WorldCharacter`), and answers 204.

The game server never writes to the database directly.

## Saving positions

The game server keeps positions in memory, and saves one when it has changed:

- when the character leaves the game;
- when it crosses into another plate (16 tiles a side);
- every 30 s;
- when the server stops, for everyone.

Saves go to Rails in the background, one at a time, keeping only each character's latest position.
