# Cave layout

A version 2 world can keep a plan of each continent's caves: rooms (nodes) joined by tunnels (arcs). /create's chamber (J), tunnel (K) and place entrance (L) tools edit it, and carving it opens the caves in the [caves](caves.md) files. Code: `client/src/create/caveLayout.js`, `client/src/create/cavePlan.js`. Schema: [cave-layout.schema.json](../schema/cave-layout.schema.json).

```
places/continents/<continent>/caves/layout.json
```

## Nodes

A node is a room. Its `at` is the middle of its floor, in feet.

- `size`: the width of the sphere the room fits in. `s` 16 ft, `m` 32, `l` 64, `xl` 128, `xxl` 256, `3xl` 512, `4xl` 1024.
- `shape`: `cathedral` (tall, with aisles), `round` (a dome with bays), `flat` (low and wide), or `entrance` (see below).
- `style`: `borehole`, `lavatube` or `mineshaft`. A mineshaft room is cut square.
- `rock`: the caves' theme, 0 jagged, 1 smooth, 2 carved, 3 mined.
- `hewn`: whether the rock is cut flat-faced.

## Entrances

An entrance is a node with `shape` `entrance`: a tube from its `mouth`, the middle of the mouth's floor on a hillside, level or sloping into the hill, and a room at its far end, its `at`, that tunnels join as they join any room.

- `yaw`: the way the tube runs in, in degrees, 0 toward +z, 90 toward +x.
- `length`: how far in the far end is, in feet across: 16, 32, 48 or 64.
- `slope`: `level`, or `down`, dropping 1 ft for every 5 in.
- `width`: the tube's width and height in feet, 6 to 24. The room at its far end is twice as wide.
- `style`: `natural`, round, or `mine`, square.
- `rock` and `hewn`, as for rooms.

Its `at` is always where `mouth`, `yaw`, `length` and `slope` put it. Its mouth has to be out in the open, all but the bottom quarter of its rim, and its room under the ground, at least 4 ft.

## Arcs

An arc is a tunnel between two nodes, `from` and `to`. It runs floor to floor through its `bends`, points in feet: only where they are across counts, not their heights. Between its level runs into its rooms it climbs or falls evenly all the way, so drawing it out longer makes it gentler. One shorter than 10 times its width along its line isn't carved.

Rooms' middles keep at least 5 times the sum of their radii apart (an entrance's room's radius is its width).

- `size`: its width in feet, 4 to 60.
- `shape`: `straight`, `wiggly`, `zigzag` or `deadends` (short side passages that stop in the rock).
- `style`: a `mineshaft` is square, a `borehole` round, a `lavatube` round and swelling.
- `rock` and `hewn`, as for nodes.

A node or arc with `locked` true can't be moved, changed or deleted in /create, and nor can the elements joined to it (a node's arcs, an arc's nodes), so it isn't carved again and keeps work done on it by hand.

## Carving

For now every room carves as a round borehole room and every tunnel as a wiggly borehole tunnel, whatever their details say. A tunnel runs level into each room it joins, across 0.7 of the room's radius, so it meets the floor; bends nearer than that give way. An entrance's tube opens through the ground wherever it would have less than 1 ft of rock over it. Every ground cell whose surface reaches into the tube is left out of the ground, and the [caves](caves.md#entrances) files keep how the ground joins the tube there. Brushing the ground round an entrance carves it again; where that leaves its mouth out of the open or its room out from under the ground, the entrance is taken away, or the brush doesn't move the ground if the entrance or a tunnel joined to it is locked. Air whose floor is over the ground isn't carved. All other air stops 4 ft under the ground, and a room that would come that near it isn't carved. /create carves each change as it's made, with the elements joined to it.

The same details always carve the same cave: the noise for each room and tunnel is seeded from its id. `carved` keeps each node or arc as it was when last carved (an arc's copy adds `ends`, its nodes' `at`). Carving a changed one fills its old shapes with rock, then opens its new ones, and carves again its unchanged neighbours that the fill touched. Uncarving fills an element's old shapes and drops it from `carved`.

Rooms are made of domes: `{kind: "dome", at, radii: [rx, ry, rz], yaw}`, a half ellipsoid whose `at` is the middle of its flat floor.
