# Bodies

A body is a creature's shape on one skeleton, and the ranges and colors each creature with that body picks its look from. The game ships its bodies as one file each. Code: `client/src/character/bodies.js`. Schema: [body.schema.json](../schema/body.schema.json).

```
client/src/character/bodies/<body>.json
```

```json
{
  "skeleton": "feline",
  "scale": 1.34,
  "reach": 2.8,
  "shape": { "H": 1.9, "L": 2.75, "head": 1.7, "ears": "cat", "tail": "cat" },
  "look": { "build": [0.45, 0.7] }
}
```

- `skeleton`: which builder makes the body, and so which bones and clips it has.
- `scale`: the body's default size against its shape's. A creature stands at the height its builder shapes, times this, times its own `scale` (see [game data](game-data.md)). A humanoid's shape is 6 ft tall.
- `reach`: how far the body reaches from its middle at its default size, in feet: the circle that ranges are measured from and that's drawn under it as a target. It takes in the bulk of the body, and heads, tails and wings can poke out of it. No reach is under three quarters of the body's height, up to 4.5 ft at 6 ft tall, and half a foot more for each foot taller, so a humanoid's is a player's. A creature's reach grows with its scale.
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

## Patterns and colorations

A body's `patterns` say how its areas are painted, and its `colorations` fill a pattern's colors. Each creature wears one coloration: the one its recipe names in `coloration`, or one picked by `weight` (1 by default). A recipe's `colors` go over the coloration's by name. Code: `client/src/character/paint.js`.

```json
"patterns": {
  "striped": {
    "colors": { "pupil": "#141212" },
    "groups": { "striped": ["coat", "back", "crown", "tail"] },
    "areas": {
      "everything": "coat",
      "lower": "belly",
      "striped": { "color": "coat", "marks": [{ "kind": "stripes", "color": "stripe", "width": 0.07, "gap": 0.09 }] },
      "eyes": "eyes",
      "pupils": "pupil"
    }
  }
},
"colorations": [
  { "name": "bengal", "pattern": "striped", "weight": 3, "colors": { "coat": "#d07a2a", "stripe": "#120e0b", "belly": "#e6c39c", "eyes": "#c8a040" } }
]
```

- A body made for one kind of animal has a few colorations named for what they look like ("bengal", "white"). A body for a folk, like goblins, has many, numbered ("goblin 1"). A body for one very particular creature, like an elephant, has one.
- A pattern's colors are the names its rules use, up to 10. Its `colors` give defaults, and a coloration's go over them.
- The builder tags every face with an area. `groups` name sets of areas and other groups. The skeleton has its own groups, and a body or pattern can add more. No group shares an area's name.
- An area takes its own rule, or else the rule of the smallest group holding it that has one, or else the color of its own name.
- A rule is a color's name, a `#rrggbb` color, or `{ color, tone, shade, marks }`:
  - `tone` lightens (over 1) or darkens (under 1) it.
  - `shade` makes each face up to that much lighter or darker, at random.
  - `marks` paint over it where they fall, each with its own `color` and `tone`. Sizes are shares of the body's height.
    - `speckled`: single faces, `amount` of them (0 to 1).
    - `spots` and `patches`: blobs `size` across, covering `amount` of the area.
    - `stripes`: `width` wide with `gap` between, `across` the body: `vertical` (the default), `horizontal` (which rings the legs) or `diagonal`. `wave` makes them waver and `break` breaks some off.

## A world's models

A world can have bodies of its own, and add patterns and colorations to the bodies the game ships, all in one file, `models.json`. Every continent shares it. Body names are lowercase letters, digits and dashes.

- `bodies`: the world's own bodies by name, each a whole body in the format above. A world never changes a shipped body. To make a variant of one, copy it here and edit the copy, under its own name or the shipped one's.
- `colorations`: by a shipped body's name, `patterns` and `colorations` to add to it. Its colorations can use the body's patterns or the ones it adds, and can't take a name the body's colorations already have.

```json
{
  "bodies": { "dire-wolf": { "skeleton": "canine", "scale": 1.6, "shape": { "...": "a copy of the wolf's" } } },
  "colorations": {
    "tiger": {
      "patterns": { "plain": { "areas": { "everything": "coat", "eyes": "eyes", "pupils": "pupil" }, "colors": { "pupil": "#141212" } } },
      "colorations": [{ "name": "ghost", "pattern": "plain", "colors": { "coat": "#e8eef4", "eyes": "#80b0d0" } }]
    }
  }
}
```

A creature's `"body": "tiger"` is the world's own tiger if it has one, or else the shipped tiger. `"body": "core:tiger"` is always the shipped tiger. A world's colorations for a shipped body reach it under both names. Pickers mark a world's own bodies as custom.

### Four-legged areas

| Group | Areas |
| --- | --- |
| `body` | coat, back, belly |
| `head` | face, crown, muzzle, jaw, nose, ears |
| `limbs` | legs, shins, paws, hooves |
| `tails` | tail, tailTip, tuft |
| `bone` | horns, antlers, tusks |
| `upper` | back, crown, ears, mane, spines, `tails` |
| `lower` | belly, muzzle, jaw, `limbs` |
| `everything` | all of the above, and mane, beard, spines, eyes, pupils, shell, plastron, cap, gills, trunk, beak |

### Other skeletons' areas

Each has one group, `everything`, holding all its areas.

| Skeleton | Areas |
| --- | --- |
| `dragon` | scales, belly, horns, eyes, dark, teeth |
| `serpent` | scales, belly, markings, eyes, dark, teeth |
| `fish`, `ray` | back, belly, fins, eyes, dark, teeth |
| `bat` | fur, wings, claws, eyes, dark, teeth |
| `crawler` | carapace, markings, claws, eyes, dark, wings |
| `slime` | jelly, eyes, dark, eyeWhites |
| `bird` | plumage, belly, beak, eyes, dark, comb |
| `strider` | hide, markings, claws, eyes, dark, teeth |
| `eyeshaug` | hide, mouth, eyes, eyeWhites, dark, teeth |

### Humanoid areas

A humanoid's areas are its look's color slots, and an area with no rule takes the color of its own name. A humanoid unit's colorations fill its body's colors: skin, hair, eyes, horn and leaf. Its clothes and gear take its look's and loadouts' `colors`. Player characters have no colorations; they're painted by their look's colors.

| Group | Areas |
| --- | --- |
| `flesh` | skin, hair, eyes, horn, leaf |
| `clothes` | primary, secondary |
| `gear` | metal, steel, wood, paint |
| `everything` | `flesh`, `clothes`, `gear` |
