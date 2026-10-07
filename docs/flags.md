# Flags

A flag records that a character has done something in a world: completed a quest, reached a
zone, got a key. A character either holds a flag or doesn't. Flags are never revoked.

Flags belong to a world and a character (`CharacterFlag`, through `WorldCharacter`), not to a
world version, so they survive version upgrades. Each also records the version it was first
granted under.

## Format

A flag is written `<type>/<identifier>`, for example `quest/completed/killMoreOrcs`.

- **Type:** one of the types below.
- **Identifier:** 1 to 64 characters of letters, digits, `_`, `-` and `/`. Case-sensitive.

| Type | Meaning | Example |
|---|---|---|
| `quest` | Completed a quest. | `quest/completed/killMoreOrcs` |
| `kill` | Tagged a unit that awards a kill flag on defeat. | `kill/grizzle-the-foul` |
| `clear` | Killed all of a zone's listed units. | `clear/goblin-cave` |
| `key` | May pass a barrier or use a connection. | `key/dire-mall` |
| `zone` | Entered a zone. Granted automatically on connecting. | `zone/reached/goblin-cave` |
| `custom` | Author-defined, fits no other type. | `custom/grizzle-trusts-you` |

Only `zone/reached` is granted today. The other types are for quests, dialogue, units and zones
to use later.

## Preloading

A zone's `flags` (compiled by the world editor's Expand) lists the flags it cares about. On
entry, Rails sends the ones the character holds to the game server (`held_flags`) and the
client (`data-held-flags`). Both cache them, and ask Rails about any other flag when they need
it. There's no way to fetch all of a character's flags.

## Endpoints

| Endpoint | For | Does |
|---|---|---|
| `GET /play/characters/:id/worlds/:world_id/flags/<flag>` | Client | `{held: bool}` |
| `GET /internal_api/world_characters/:id/flags/<flag>` | Game server | `{held: bool}` |
| `POST /internal_api/world_characters/:id/flags` `{flag}` | Game server | Grants it. Idempotent. |

An invalid flag gets a 422.
