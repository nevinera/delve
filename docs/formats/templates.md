# Templates

A template is a group of [slabs](slabs.md) and objects saved together, to place into the world as copies. A world keeps its templates as `templates/<id>.json`, each in one of the collections `template-collections.json` lists, as its objects are. The world never holds a template itself: placing one copies its slabs and objects into the tiles. Code: `client/src/world/templates.js`. [Schema](../schema/template.schema.json).

```json
{
  "id": "hut00001",
  "name": "Woodcutter's hut",
  "tags": ["wood", "small"],
  "collection": "tmpl0001",
  "slabs": [
    { "at": [0, 1, 0], "turn": [0, 0, 0], "outline": [[0, 0], [16, 0], [16, 16], [0, 16]], "thickness": 1, "surface": "floorboards" }
  ],
  "objects": [
    { "type": "built:stool001", "at": [6, 6], "y": 1, "yaw": 0, "scale": 1 }
  ],
  "ground": [[0, 0, 0], [1, 0, 0], [0, 1, 0.25], [1, 1, 0.5]]
}
```

## The anchor

Everything in a template is in feet from its anchor: a corner of the world's 8 ft cell grid, at the height the template stands on. x runs east and z south. Keeping the anchor on the grid means a template's ground lands on whole cells.

## Fields

- `slabs` are slabs as tiles hold them, their `at` from the anchor.
- `objects` are placed objects as tiles hold them, `{ type, at: [x, z], yaw, scale, colors, texts }`, with `at` from the anchor. `y`, when there is one, is feet up from the anchor; an object without it stands on whatever's under it. A template can't hold a structure or another template.
- `ground`, when the template was saved with it, is the ground under it: `[i, j, height]` for each cell, cell `(i, j)` covering `i` to `i + 1` and `j` to `j + 1` cells from the anchor, its height in feet up from the anchor. It covers the cells inside the convex hull of the template's slabs and objects.

## Limits

- Up to 512 slabs and objects together, none more than 256 ft (32 cells) from the anchor.
- Each slab keeps a slab's own limits.
- At least one slab or object.
