import { nearestOnStroke } from "./features.js";

// Which way rivers flow. Each segment of a river runs downhill, from whichever end is higher
// (heightAt, continent tile units to feet), or the way it was drawn where both ends are level.
// Rivers join where they share a point, or where one ends on another's line. Every point needs a
// way out: a segment flowing away from it, a river it joins, or the sea under it. Points without
// one are stuck, and water would pool there. Points more than one segment flows away from split
// the river.

const JOIN_TILES = 0.05; // an end this close to another river's line joins it

// rivers: strokes ({ id, points, width }). Returns { flow, stuck, splits }: flow maps each river's
// id to one boolean per segment, true when it flows the way it was drawn; stuck lists the points
// ([x, z]) with no way out, and splits the points with more than one.
export function riverFlow(rivers, heightAt) {
  const key = ([x, z]) => `${x},${z}`;
  const heights = new Map();
  const height = (p) => {
    if (!heights.has(key(p))) heights.set(key(p), heightAt(p[0], p[1]));
    return heights.get(key(p));
  };
  const flow = new Map();
  const out = new Map(); // point key -> how many segments flow out of it
  for (const river of rivers) {
    const segments = [];
    for (let i = 1; i < river.points.length; i++) {
      const [a, b] = [river.points[i - 1], river.points[i]];
      const forward = height(b) <= height(a);
      segments.push(forward);
      const from = key(forward ? a : b);
      out.set(from, (out.get(from) ?? 0) + 1);
    }
    flow.set(river.id, segments);
  }

  const stuck = [];
  const splits = [];
  const seen = new Set();
  for (const river of rivers) {
    for (const p of river.points) {
      if (seen.has(key(p))) continue;
      seen.add(key(p));
      if (out.get(key(p)) > 1) splits.push(p);
      if (out.has(key(p)) || height(p) < 0) continue;
      // Ending on another river's line carries on down it. Ending on one of its points is a shared
      // point, which needs its own way out.
      const joins = rivers.some(
        (other) => other !== river && other.points.length > 1 && !other.points.some((q) => key(q) === key(p)) && nearestOnStroke(other.points, p).dist < JOIN_TILES,
      );
      if (!joins) stuck.push(p);
    }
  }
  return { flow, stuck, splits };
}
