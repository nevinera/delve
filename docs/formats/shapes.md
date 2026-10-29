# Shapes

`shapes.json` holds what each kind of object looks like to line of sight: a mesh of a few dozen faces standing in for its pieces. The game server and the client test sight against these, not against the objects themselves: a line is blocked where it crosses a face. The editor writes the file whenever it stores the world, for every kind the plates place that blocks sight. Edit objects in the editor, not this file.

```json
{
  "version": 1,
  "kinds": {
    "boulder": {"points": [[0.42, -0.08, 0.17], ...], "faces": [[0, 1, 2, 3], ...]},
    "built:bvill003": {"points": [...], "faces": [...]}
  }
}
```

Each kind is keyed as plates name it: a built-in kind such as `boulder`, or `built:<id>` for a built object. Structures have no shapes.

## Meshes

- `points` are the mesh's corners, `[x, y, z]` in feet, in the kind's own axes at scale 1: x east and z south before the object turns, y up, and y = 0 where the object is seated on the ground.
- `faces` are its faces, each a loop of indices into `points`, counterclockwise seen from outside. A face is flat. Faces with holes cut through them are triangles.

A placed object scales its mesh by its scale, turns it by its yaw, and moves it to where it stands.

## What blocks sight

A built object blocks line of sight unless it has `"blocksSight": false`, which the object builder's "blocks sight" box sets. Built-in kinds you see through or over, such as fences, lamp posts and rugs, are marked in code. Kinds that don't block sight aren't in the file.

## How meshes are made

The editor takes every corner of the object's pieces, leaving out holes. Code-made kinds, which have no pieces, are a prism over their footprint, as tall as the kind, sunk as the game draws them.

The editor wraps those corners in a convex hull of at most 32 corners, the way PhysX cooks a convex mesh with a vertex limit (its default method, not plane shifting):

1. It builds the exact hull. Faces within 3° of a neighbour are joined, and corners that only rounding put on an edge or a face are dropped.
2. It fits a box around it, turned to the hull's principal axes and then in 18° steps about each, keeping the box of least volume.
3. It cuts the box with the exact hull's faces, one at a time. Each time it takes the face the shape pokes out of farthest, for its width across that face.
4. It stops before a cut that would leave more than 32 corners, or when nothing pokes out.

Every cut is a face of the exact hull, pushed out to touch the object, so the hull holds the whole object. `client/src/editor/limitedHull.js` has the details.

Then the object's `sightCuts` are taken out of the hull, so you can see through an arch or a window. Each is an outline swept right through the object, either both ways along a direction (`along`) or out from a point of view as a cone (`from`). The object builder cuts from where its camera is, so a hole goes where you traced it. The cut mesh may have T-junctions, where one face's edge meets another's corner, which don't let sight through.
