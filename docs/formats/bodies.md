# Bodies

A body is a creature's shape on one skeleton, and the ranges and colors each creature with that body picks its look from. The game ships its bodies as one file each. Code: `client/src/character/bodies.js`. Schema: [body.schema.json](../schema/body.schema.json).

```
client/src/character/bodies/<body>.json
```

```json
{
  "skeleton": "feline",
  "shape": { "H": 1.9, "L": 2.75, "head": 1.7, "ears": "cat", "tail": "cat", "pattern": "stripes" },
  "look": { "height": [3.4, 4], "build": [0.45, 0.7], "colors": { "skin": ["#d07a2a"], "hair": ["#1a1410"] } }
}
```

- `skeleton`: which builder makes the body, and so which bones and clips it has.
- `shape`: the builder's settings for this body. Each skeleton takes its own, listed at the top of its builder.
- `look`: a recipe's settings (see [game data](game-data.md)), as ranges and lists that each creature picks from. A humanoid body has no `shape`; its look's settings (ears, horns, tail and the rest) are its shape.

| Skeleton | Builder | Bodies |
| --- | --- | --- |
| `humanoid` | `body.js` | goblin, orc, troll and the other folk |
| `canine`, `feline`, `ursine`, `hoofed`, `lizard`, `pachyderm` | `quadruped.js` | four-legged bodies |
| `dragon` | `dragon.js` | dragon, wyvern |
| `serpent` | `serpent.js` | snakes, centipede, eel, coatl |
| `fish`, `ray` | `fish.js` | swimmers |
| `bat` | `bat.js` | bat |
| `crawler` | `crawler.js` | spiders, insects, crab |
| `slime` | `slime.js` | slime, wisp |
| `bird` | `bird.js` | birds |
| `strider` | `strider.js` | raptor, tyrant, ostora |
| `eyeshaug` | `eyeshaug.js` | eyeshaug |

Shape settings that name a part, like `ears: "cat"` or `tail: "bushy"`, pick from the parts the builder knows.
