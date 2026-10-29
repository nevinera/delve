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
| `move` | `t`, `at`, `yaw`, `move` | whenever its movement changes: starting, stopping, turning, jumping, changing gait |
| `heartbeat` | `t`, `at`, `yaw` | twice a second while moving or turning, once a second otherwise |

`t` is the client's clock in milliseconds when it sent the message, from a clock that only goes forward (`performance.now()` in a browser). Without it, the server times the message by when it arrived.

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
| `correct` | `at`, `yaw` | your last report didn't add up: you're back at `at` |
| `error` | `message` | before the server closes the connection |

A character is `{ id, name, look, continent, at, yaw, move }`. `look` is the character builder's look.

"Near you" is the 3×3 tiles around your tile, on your continent and layer.

## Movement checks

The game server checks that each report follows from the last one it took, the way the genre's servers do. It checks speeds and clocks, and where you stand against the continent's surface plates.

- **Speed:** how far you went across the ground since the last report, against how fast you were moving: run 21 ft/s, walk 7.5, back up 13.5, swim 14.2, and sprint doubles running. That allows 15% and 4 ft extra for timing. Standing still, you can't move. A report far away is a teleport and fails the same way.
- **Clock:** for the first 5 s, the server measures how far your clock is behind its own. After that, a report whose clock is more than half a second further ahead fails, since a fast clock would give you more time to move in. A clock that goes backward fails too.
- **Rising:** you can climb 1.5 ft for each foot you move across, plus 4 ft, and a jump's height (about 2.7 ft) within 1.5 s of jumping.
- **Falling:** you can drop as fast as gravity (48 ft/s²) takes you since you started down, plus 1.5 ft for each foot across.
- **Ground:** you can't go onto a spot with no tile, or more than 2 ft under the ground. Off the ground and not jumping, you have to fall as gravity would, after half a second's grace, so you can't float or walk on water. Walking from ground to ground, you can't climb slopes steeper than the client lets you walk (1.2 ft up for each foot across, with 25% and 2 ft extra). You can only swim in water deeper than 4.5 ft.
- **Entering:** your first report has to be near where the server put you, allowing for moving at a sprint since then, and is checked against the ground too. The server puts you on the ground at the spawn point, or at swimming depth in deep water.

The server keeps each fall's height and time when you land, for fall damage later.

A report that fails isn't passed on. The server sends `correct`, and the client puts you back there and reports afresh. Reports that arrive before the client has taken the correction are dropped quietly for up to 2 s. More than 10 corrections in a minute drops the connection.

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
