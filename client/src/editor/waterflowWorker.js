import { simulateWater } from "./waterflow.js";
import { prepareShape, seaAt, shapeHeight } from "../world/generator.js";
import { makePolyline, nearBounds, nearest } from "../world/polyline.js";

// Works out where a source's water goes (waterflow.js) off the main thread, from the land grid
// alone: the ground is the land's rough shape, as the heights step shows it. Water already there
// is the sea and the sketch's water: { rivers: [{ points, half }], lakes: [region] } in ft.
let land = null; // { key, shape } for the latest land

self.onmessage = ({ data }) => {
  const { key, landKey, continent, seedKey, sources, water = { rivers: [], lakes: [] } } = data;
  if (land?.key !== landKey) land = { key: landKey, shape: prepareShape(continent, seedKey) };
  const rivers = water.rivers.filter((r) => r.points.length >= 2).map((r) => ({ line: makePolyline(r.points), half: r.half }));
  const inLake = (x, z) => water.lakes.some((region) => region.some(([outer, ...holes]) => inRing(x, z, outer) && !holes.some((h) => inRing(x, z, h))));
  const result = simulateWater({
    sources,
    heightAt: (x, z) => shapeHeight(land.shape, x, z),
    isWater: (x, z) => seaAt(land.shape, x, z) || rivers.some((r) => nearBounds(r.line, x, z, r.half) && nearest(r.line, x, z).dist < r.half) || inLake(x, z),
    seed: land.shape.seed,
  });
  self.postMessage({ key, result });
};

function inRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
