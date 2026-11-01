# Cave layout

A version 2 world can keep a plan of each continent's caves: rooms (nodes) joined by tunnels (arcs). /create's chamber (J) and tunnel (K) tools edit it, and carving it opens the caves in the [caves](caves.md) files. Code: `client/src/create/caveLayout.js`, `client/src/create/cavePlan.js`. Schema: [cave-layout.schema.json](../schema/cave-layout.schema.json).

```
places/continents/<continent>/caves/layout.json
```

## Nodes

A node is a room. Its `at` is the middle of its floor, in feet.

- `size`: the width of the sphere the room fits in. `s` 16 ft, `m` 32, `l` 64, `xl` 128, `xxl` 256, `3xl` 512, `4xl` 1024.
- `shape`: `cathedral` (tall, with aisles), `round` (a dome with bays), `flat` (low and wide), or `opening`, a cave's mouth: a node on the ground, its `at` on it. Only an opening may reach up through the ground, and a node on the ground is always one.
- `style`: `borehole`, `lavatube` or `mineshaft`. A mineshaft room is cut square.
- `rock`: the caves' theme, 0 jagged, 1 smooth, 2 carved, 3 mined.
- `hewn`: whether the rock is cut flat-faced.

## Arcs

An arc is a tunnel between two nodes, `from` and `to`. It runs floor to floor through its `bends`, points in feet.

- `size`: its width in feet, 4 to 60.
- `shape`: `straight`, `wiggly`, `zigzag` or `deadends` (short side passages that stop in the rock).
- `style`: a `mineshaft` is square, a `borehole` round, a `lavatube` round and swelling.
- `rock` and `hewn`, as for nodes.

## Carving

The same details always carve the same cave: the noise for each room and tunnel is seeded from its id. `carved` keeps each node or arc as it was when last carved (an arc's copy adds `ends`, its nodes' `at`). Carving a changed one fills its old shapes with rock, then opens its new ones, and carves again its unchanged neighbours that the fill touched. Uncarving fills an element's old shapes and drops it from `carved`.

Rooms are made of domes: `{kind: "dome", at, radii: [rx, ry, rz], yaw}`, a half ellipsoid whose `at` is the middle of its flat floor.
