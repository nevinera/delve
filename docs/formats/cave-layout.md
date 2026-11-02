# Cave layout

A version 2 world keeps the layout of each continent's caves: its cave networks, and in each, the entrances, points and segments that carving opens into the [caves](caves.md) files. /create's place entrance tool (J, in caves) edits it. Code: `client/src/create/caveLayout.js`, `client/src/create/cavePlan.js`. Schema: [cave-layout.schema.json](../schema/cave-layout.schema.json).

```
places/continents/<continent>/caves/layout.json
```

Its `version` is 2. /create drops a layout of version 1, from before networks, when it reads one, as it drops the caves files from then, and saves an empty one in its place. The game server doesn't read this file.

## Networks

`networks` lists the cave networks, each `{ slug, phase }`.

- `slug`: the network's name, lowercase words of letters and digits joined by hyphens, such as `wailing-hollow`. The caves files name it on each of its tile lines.
- `phase`: `layout`, while its passages are laid out and carved again as they change, or `polish`, once it's burned in.

Every element below has a `net`, the slug of its network, and an `id`: `e`, `p` or `s` and a number.

## Entrances

A network starts from an entrance: a tube from its `mouth`, the middle of the mouth's floor on a hillside, level or sloping into the hill, to its `point`, a point at its far end that passages go on from.

- `yaw`: the way the tube runs in, in degrees, 0 toward +z, 90 toward +x.
- `length`: how far in the far end is, in feet across: 16, 32, 48 or 64.
- `slope`: `level`, or `down`, dropping 1 ft for every 5 in.
- `width`: the tube's width and height in feet, 8 to 24.
- `style`: `natural`, round, or `mine`, square.
- `rock`: the rock's theme, 0 jagged, 1 smooth, 2 carved, 3 mined.
- `hewn`: whether the rock is cut flat-faced.

Its point's `at` is always where `mouth`, `yaw`, `length` and `slope` put it. Its mouth has to be out in the open, all but the bottom quarter of its rim, and its far end under the ground, at least 4 ft.

## Points

A point holds the config of the passage round it. Its `at` is the middle of the passage's floor there, in feet.

- `width` and `height`: the passage's, in feet.
- `qualities`: a list of the qualities its section has.
- `rock` and `hewn`, as for entrances.

## Segments

A segment joins two points, `from` and `to`, with a passage.

## Carving

A segment carves a tube from its `from` point's floor to its `to` point's, its width and height easing from one point's to the other's. An entrance's tube opens through the ground wherever it would have less than 1 ft of rock over it. Air whose floor is over the ground isn't carved. All other air stops 4 ft under the ground, and a segment that would come that near it isn't carved. /create carves each change as it's made. Everything an element carves is in its network.

`carved` keeps each entrance and segment as it was when last carved, by id: a copy of it, a segment's with `ends`, copies of its two points, and `near`, copies of the other points within 3 segments of them, by id. A segment's shape can depend on those points and nothing further, and any randomness in it is seeded from its id alone. An element is carved again when its copy now differs from the one kept, so a change to a point carves again the segments within 3 of it. Carving a changed one fills its old shapes with rock, then opens its new ones, and carves again its unchanged neighbours that the fill touched.

Shapes are domes, `{kind: "dome", at, radii: [rx, ry, rz], yaw}`, a half ellipsoid whose `at` is the middle of its flat floor, and boxes, `{kind: "box", at, half: [x, y, z], yaw}`.
