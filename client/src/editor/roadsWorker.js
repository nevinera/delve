import { findRoute, gradeCap, riverLookup } from "./roads.js";
import { prepareWorld, routeGround } from "../world/generator.js";
import { TILE_FT } from "../world/constants.js";

// Works out road routes (roads.js) off the main thread, over the ground generator.js routeGround
// gives, answering each job as its route's found, then { done }. Routes are kept by their keys, so
// asking again for one that's been worked out on the same land is free.
const ROUTES_KEPT = 500;
let land = null; // { key, ctx, riverAt, routes }

self.onmessage = ({ data }) => {
  const { landKey, continent, seedKey, jobs } = data;
  if (land?.key !== landKey) {
    const ctx = prepareWorld(continent, seedKey);
    const rivers = (continent.watercourses?.rivers ?? []).map((r) => ({ points: r.points.map(toFt), width: r.width ?? 30 }));
    land = { key: landKey, ctx, riverAt: riverLookup(rivers), routes: new Map() };
  }
  for (const { id, key, from, to, width } of jobs) {
    let route = land.routes.get(key);
    if (!route) {
      const found = findRoute({ from: toFt(from), to: toFt(to), cap: gradeCap(width), ground: (x, z) => routeGround(land.ctx, x, z), riverAt: land.riverAt });
      route = found ? { points: found.points.map(toTiles), lengthFt: Math.round(found.lengthFt), grade: Math.round(found.grade * 1000) / 1000 } : { points: null };
      if (land.routes.size >= ROUTES_KEPT) land.routes.delete(land.routes.keys().next().value);
      land.routes.set(key, route);
    }
    self.postMessage({ id, key, route });
  }
  self.postMessage({ done: true });
};

const toFt = ([x, z]) => [x * TILE_FT, z * TILE_FT];
const toTiles = ([x, z]) => [Math.round((x / TILE_FT) * 1000) / 1000, Math.round((z / TILE_FT) * 1000) / 1000];
