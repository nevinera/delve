import { strFromU8, strToU8 } from "fflate";

// A continent's areas: polygons on the ground that other things point at by id, such as a rest
// point's resting area. They can overlap, and be any size. Kept in
//
//   places/continents/<c>/regions.json   { "version": 1, "areas": [{ "id", "points": [[x, z], ...] }] }
//
// in continent feet. An area's id is its own, apart from whatever points at it.

export const regionsPath = (continent) => `places/continents/${continent}/regions.json`;

// A new area id, "area" and four letters or digits, one no area in `taken` has.
export function areaId(taken, random = Math.random) {
  for (;;) {
    const id = `area${Math.floor(random() * 36 ** 4).toString(36).padStart(4, "0")}`;
    if (!taken.some((a) => a.id === id)) return id;
  }
}

// The areas in a regions.json, leaving out any without an id or three corners.
export function readAreas(json) {
  const whole = (a) => typeof a?.id === "string" && Array.isArray(a.points) && a.points.length >= 3 && a.points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
  return (Array.isArray(json?.areas) ? json.areas : []).filter(whole).map((a) => ({ id: a.id, points: a.points.map(([x, z]) => [x, z]) }));
}

// Moves rest points' resting areas out of world.json, where each held its own polygon, into areas
// in their continents' regions.json, each rest point keeping its area's id. `files` maps paths to
// bytes and is changed in place. Gives how many it moved.
export function moveRestAreas(files, random = Math.random) {
  const bytes = files.get("world.json");
  if (!bytes) return 0;
  const info = JSON.parse(strFromU8(bytes));
  const regions = new Map(); // continent -> its regions.json
  const regionsOf = (continent) => {
    if (!regions.has(continent)) {
      const had = files.get(regionsPath(continent));
      regions.set(continent, had ? JSON.parse(strFromU8(had)) : { version: 1, areas: [] });
    }
    return regions.get(continent);
  };
  let moved = 0;
  for (const rest of info.restPoints ?? []) {
    if (!Array.isArray(rest.area)) continue;
    if (rest.area.length < 3) {
      delete rest.area;
      continue;
    }
    const json = regionsOf(rest.continent);
    json.areas ??= [];
    const id = areaId(json.areas, random);
    json.areas.push({ id, points: rest.area });
    rest.area = id;
    moved++;
  }
  if (!moved) return 0;
  files.set("world.json", strToU8(`${JSON.stringify(info, null, 2)}\n`));
  for (const [continent, json] of regions) files.set(regionsPath(continent), strToU8(`${JSON.stringify(json)}\n`));
  return moved;
}
