---
name: convert-world
description: Run the world converters (version 1 to 2, binary plates to text, deepening the sea) and check the result. Use when a world won't open in /create or needs moving to the current format.
---

# Convert a world

Each script takes a zip and writes a new zip, leaving the old one alone. `text-plates` can also rewrite a checked-out world in place.

| Script | Use it when |
| --- | --- |
| `node script/convert-v2.mjs <v1.zip> <v2.zip>` | `/create` says it's a version 1 world. Every biome comes out as plains. |
| `node script/text-plates.mjs <in.zip> <out.zip>` or `<folder>` | plates or platters are still gzipped binary. It lists files it can't read. |
| `node script/deepen-sea.mjs <in.zip> <out.zip>` | a converted world's sea has ground flat at its surface. Run it once. |
| `node script/steep-platters.mjs <in.zip> <out.zip>` or `<folder>` | the map in play shows no steep ground: the platters were saved before they kept it. |

Opening a file in `/create` replaces the world kept in that browser and clears its unsaved changes. To run a script on a world you're editing, download it from `/create` first.

## Check the result

1. Run the [measure-world](../measure-world/SKILL.md) script on the output. It has to report no failures.
2. Open it with [screenshot-create](../screenshot-create/SKILL.md) and look at the ground.
