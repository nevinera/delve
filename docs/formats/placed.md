# Placed objects and slabs

A version 2 world keeps the objects and [slabs](slabs.md) placed by hand in /create in a JSON file for each plate (2,048 ft square) that has any. Code: `client/src/create/placed.js`.

```
places/continents/<continent>/placed/<px>_<pz>.json
```

```json
{
  "version": 1,
  "objects": [
    { "type": "boulder", "at": [6150.5, 2040], "yaw": 1.2, "scale": 4, "colors": [[0.5, 0.48, 0.45]], "footprint": { "circle": 1.8 }, "height": 3.2 },
    { "type": "built:stool001", "at": [6152, 2041.5], "y": 43, "yaw": 0, "scale": 1, "template": "hut00001", "footprint": { "circle": 0.75 }, "height": 1.5 }
  ],
  "slabs": [
    { "at": [6150, 42, 2036], "turn": [0, 0, 0], "outline": [[0, 0], [16, 0], [16, 16], [0, 16]], "thickness": 1, "surface": "floorboards" }
  ]
}
```

## Which plate

Plate `(px, pz)` covers `[px * 2048, (px + 1) * 2048)` each way, in continent feet. An object is in the plate its `at` is in. A slab is in the plate its home corner is in: the north-most top corner, the west-most of those.

## Objects

- `type` is a built-in kind such as `boulder`, or `built:<id>` for one of the world's objects.
- `at` is `[x, z]` in continent feet.
- `y`, when there is one, is the height it stands at, as on a slab or a cave's floor. One hung from a cave's ceiling stands that far below it, its top at the ceiling. An object without one stands on what's under it.
- `yaw` is radians about up. `scale` is feet for a built-in kind, or a factor for a built object.
- `colors` and `texts` are as the world's tiles keep them ([plates](plates.md#place-lines)).
- `template`, when there is one, is the template it was placed from.
- `cave`, when there is one, is the cave network it's in: the one whose 32 ft chunk it's in, under the ground there. /create keeps it as things are placed and moved, places or moves things into a network only while it's being polished, and takes them all away if it goes back to layout.

- `footprint` and `height` are what stands in the way, in feet, worked out from its type and scale when it's saved, so the game server needs no object library: `{ "circle": r }`, `{ "capsule": [r, half] }` along its own x, `{ "rect": [w, d] }`, or `{ "open": r }` for one that doesn't block. Files saved before they were kept leave them out, and the server works out a built-in kind's itself.

## Slabs

Each is a [slab](slabs.md), with `template` when it was placed from one, and `cave` as objects have it.
