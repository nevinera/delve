// Builds a zone from its zone-build.json (see docs/zone-build.md): each map
// generated at its size, theme, tags, seed and exit sides, with Auto
// Barriers' walls and exit connections; the zone file linking them; its
// unit types copied into the world from the content library; and the
// world file's zone entry, entry points and links to other built zones.
// Pure: the caller (bin/zone-build) reads and writes the files, through
// `read(path)` (parsed JSON, or null for none) with paths relative to the
// world's directory.
import {generateCellMap} from "../cellMap/generate";
import {SIDES} from "../cellMap/exits";
import {THEMES, terrainAt} from "../cellMap/format";
import {CELL_SIZE, cellCenter, mapSize} from "../cellMap/hexGrid";
import {autoBarriers} from "../mapEditor/cells/autoBarriers";

const ID_RE = /^[a-z][a-z0-9-]*$/;
const MAP_FIELDS = ["name", "elvl", "theme", "size", "tags", "seed", "exits", "entry", "annotations"];
const ZONE_FIELDS = ["name", "description", "elvl", "private", "start", "unitTypes", "maps", "annotations"];
const ARRIVAL = "arrival";
// Terrain that isn't open ground, for placing an arrival point.
const CLOSED = new Set(["trees", "water"]);

// Error messages for a zone-build spec, empty when it's fine. zone is the
// zone's key, for exits back to itself.
export function validateSpec(spec, zone) {
  const errors = [];
  if (!isObject(spec)) return ["the spec must be an object"];
  const unknown = Object.keys(spec).filter((k) => !ZONE_FIELDS.includes(k));
  if (unknown.length) errors.push(`unknown fields: ${unknown.join(", ")} (known: ${ZONE_FIELDS.join(", ")})`);
  if (typeof spec.name !== "string" || !spec.name) errors.push("name is required");
  if (!Number.isInteger(spec.elvl) || spec.elvl < 0) errors.push("elvl must be a whole number, 0 or more");
  if (spec.unitTypes !== undefined && !(Array.isArray(spec.unitTypes) && spec.unitTypes.every((k) => typeof k === "string"))) errors.push("unitTypes must be a list of unit type keys");
  if (!isObject(spec.maps) || !Object.keys(spec.maps).length) return [...errors, "maps must be an object of at least one map"];
  for (const [id, map] of Object.entries(spec.maps)) errors.push(...validateMap(id, map, spec.maps, zone));
  if (spec.start && !Object.values(spec.maps).some((m) => m.entry)) errors.push("a start zone needs a map with entry: true");
  return errors;
}

function validateMap(id, map, maps, zone) {
  const at = `maps.${id}`;
  if (!ID_RE.test(id)) return [`${at}: map identifiers are lowercase words with - between them`];
  if (!isObject(map)) return [`${at} must be an object`];
  const errors = [];
  const unknown = Object.keys(map).filter((k) => !MAP_FIELDS.includes(k));
  if (unknown.length) errors.push(`${at}: unknown fields: ${unknown.join(", ")} (known: ${MAP_FIELDS.join(", ")})`);
  if (!THEMES[map.theme]) errors.push(`${at}.theme must be one of: ${Object.keys(THEMES).join(", ")}`);
  if (!(Array.isArray(map.size) && map.size.length === 2 && map.size.every((n) => Number.isInteger(n) && n >= 8 && n <= 200))) errors.push(`${at}.size must be [cols, rows], each 8 to 200`);
  if (map.elvl !== undefined && !(Number.isInteger(map.elvl) && map.elvl >= 0)) errors.push(`${at}.elvl must be a whole number, 0 or more`);
  if (map.seed !== undefined && !Number.isInteger(map.seed)) errors.push(`${at}.seed must be a whole number`);
  if (map.tags !== undefined && !(Array.isArray(map.tags) && map.tags.every((t) => typeof t === "string"))) errors.push(`${at}.tags must be a list`);
  for (const [side, exit] of Object.entries(map.exits ?? {})) {
    if (!SIDES.includes(side)) {
      errors.push(`${at}.exits: ${side} isn't a side (${SIDES.join(", ")})`);
      continue;
    }
    const target = exitTarget(exit);
    if (!target) {
      errors.push(`${at}.exits.${side} must be a map identifier, or {map, zone?, at?}`);
      continue;
    }
    if (target.at !== undefined && !(Number.isFinite(target.at) && target.at >= 0 && target.at <= 1)) errors.push(`${at}.exits.${side}.at must be 0 to 1`);
    if (target.zone && target.zone !== zone) continue;
    const other = maps[target.map];
    if (!other) errors.push(`${at}.exits.${side}: no map ${target.map} in this zone`);
    else if (!backSide(other, id, zone)) errors.push(`${at}.exits.${side}: ${target.map} has no exit back to ${id}`);
  }
  return errors;
}

// An exit as {map, zone, at} (zone undefined for this zone), or null.
export function exitTarget(exit) {
  if (typeof exit === "string") return {map: exit};
  if (isObject(exit) && typeof exit.map === "string") return {map: exit.map, zone: exit.zone, at: exit.at};
  return null;
}

// The side of `map` (a map spec) whose exit leads to map `id` in this zone.
function backSide(map, id, zone) {
  return Object.entries(map.exits ?? {}).find(([, exit]) => {
    const target = exitTarget(exit);
    return target && target.map === id && (!target.zone || target.zone === zone);
  })?.[0];
}

// The open connection name for a map's exit to another zone.
export const openName = (map, side) => `${map}-${side}`;

// ---- Maps ----

// A map file for map `id`: generated, with Auto Barriers' walls, fill
// points, exit connections (named for their sides) and places, and an
// arrival point when it's an entry. Throws when Auto Barriers can't wall
// it (too many segments or fill points).
export function buildMap(id, spec, zoneSpec) {
  const [cols, rows] = spec.size;
  const exits = SIDES.filter((side) => spec.exits?.[side] !== undefined).map((side) => {
    const {at} = exitTarget(spec.exits[side]);
    return at === undefined ? side : {side, at};
  });
  const cellMap = generateCellMap({cols, rows, seed: spec.seed ?? seedFor(id), exits, tags: spec.tags ?? [], theme: spec.theme});
  const {barriers, connections, places, fillPoints, error} = autoBarriers(cellMap);
  if (error) throw new Error(`${id}: ${error}`);
  const feetDimensions = mapSize(cellMap.grid);
  if (spec.entry) connections.push(arrival(cellMap, feetDimensions));
  return {
    identifier: id, name: spec.name ?? titleOf(id),
    ...(spec.elvl !== undefined && spec.elvl !== zoneSpec.elvl ? {elvl: spec.elvl} : {}),
    feetDimensions, cellMap, barriers, connections, fillPoints,
    ...(places.length ? {places} : {}),
    ...(spec.annotations ? {annotations: spec.annotations} : {}),
  };
}

// A seed from the map's identifier, so a map without one comes out the same
// each build.
export function seedFor(id) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 1_000_000;
}

// A point connection where players arrive: the open cell nearest the map's
// middle that's open two cells all round, so it's clear of the walls.
function arrival(cellMap, {height}) {
  const {cols, rows} = cellMap.grid;
  const open = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && !CLOSED.has(terrainAt(cellMap, c, r));
  const clear = (c, r) => {
    for (let dc = -2; dc <= 2; dc++) for (let dr = -2; dr <= 2; dr++) if (!open(c + dc, r + dr)) return false;
    return true;
  };
  let best = null;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!clear(c, r)) continue;
      const d = (c - cols / 2) ** 2 + (r - rows / 2) ** 2;
      if (!best || d < best.d) best = {c, r, d};
    }
  }
  if (!best) throw new Error("no open ground for an arrival point");
  const {x, y} = cellCenter(best.c, best.r, CELL_SIZE);
  return {identifier: ARRIVAL, type: "point", position: {x: round(x), y: round(height - y), angle: 0}, fuzzRadius: 5, fuzzAngle: 360};
}

// ---- The zone ----

// The zone file: `existing` (the zone file as it is, or null) with its
// name, elvl, maps, links between them, open connections, entry points and
// unit types set from the spec, and anything else it has kept.
export function buildZone(spec, zone, existing) {
  const ids = Object.keys(spec.maps);
  const zoneLinks = [];
  const openConnections = {};
  for (const id of ids) {
    for (const side of SIDES) {
      const exit = spec.maps[id].exits?.[side];
      if (exit === undefined) continue;
      const target = exitTarget(exit);
      if (target.zone && target.zone !== zone) {
        openConnections[`${id}/${side}`] = openName(id, side);
        continue;
      }
      // Each pair once, from the map listed first.
      if (ids.indexOf(target.map) < ids.indexOf(id)) continue;
      zoneLinks.push({connectionA: {map: id, connection: side}, connectionB: {map: target.map, connection: backSide(spec.maps[target.map], id, zone)}, oneWay: false, requiredKey: null});
    }
  }
  const entryPoints = Object.fromEntries(ids.filter((id) => spec.maps[id].entry).map((id) => [`${id}/${ARRIVAL}`, null]));
  const unitTypes = {...(existing?.unitTypes ?? {})};
  for (const key of spec.unitTypes ?? []) unitTypes[key] = {$ref: `../../unit_types/${key}.json`, referenceTo: "unit_type"};
  return {
    ...(existing ?? {}),
    name: spec.name,
    ...(spec.description ? {description: spec.description} : {}),
    elvl: spec.elvl,
    private: spec.private ?? false,
    maps: ids.map((id) => ({$ref: `./${id}/${id}.json`, referenceTo: "map"})),
    ...(Object.keys(unitTypes).length ? {unitTypes} : {}),
    zoneLinks,
    ...(Object.keys(entryPoints).length ? {entryPoints} : {}),
    ...(Object.keys(openConnections).length ? {openConnections} : {}),
    ...(spec.annotations ? {annotations: {...(existing?.annotations ?? {}), ...spec.annotations}} : {}),
  };
}

// ---- The world ----

// The world file with this zone in it: `world` (as it is, or null for a new
// one named `worldName`) with the zone's entry, its entry points if it's a
// start zone, and a link for each of its exits to another zone whose spec
// (in `specs`, by zone key) has the exit back. Links already there stay.
export function buildWorld(world, worldName, zone, spec, specs) {
  const next = world ? structuredClone(world) : {name: worldName, zones: {}, worldLinks: [], entryPoints: {}};
  next.zones = {...next.zones, [zone]: {...(next.zones?.[zone] ?? {}), path: `./zones/${zone}/${zone}.json`, name: spec.name, ...(spec.description ? {description: spec.description} : {})}};
  next.entryPoints = {...(next.entryPoints ?? {})};
  if (spec.start) for (const id of Object.keys(spec.maps)) if (spec.maps[id].entry) next.entryPoints[`${zone}/${id}/${ARRIVAL}`] ??= null;
  const links = [...(next.worldLinks ?? [])];
  const has = (a, b) => links.some(({zoneA, zoneB}) => [[zoneA, zoneB], [zoneB, zoneA]].some(([x, y]) => same(x, a) && same(y, b)));
  for (const [id, map] of Object.entries(spec.maps)) {
    for (const side of SIDES) {
      const target = exitTarget(map.exits?.[side]);
      if (!target?.zone || target.zone === zone) continue;
      const other = specs[target.zone]?.maps?.[target.map];
      const back = other && Object.entries(other.exits ?? {}).find(([, e]) => {
        const t = exitTarget(e);
        return t?.zone === zone && t.map === id;
      })?.[0];
      if (!back) continue;
      const a = {zone, kind: "open", connection: openName(id, side)};
      const b = {zone: target.zone, kind: "open", connection: openName(target.map, back)};
      if (!has(a, b)) links.push({zoneA: a, zoneB: b, oneWay: false, requiredKey: null});
    }
  }
  next.worldLinks = links;
  return next;
}

// Exits to other zones that no built zone answers yet: [{map, side, zone,
// target}], for the CLI to report.
export function pendingLinks(zone, spec, specs) {
  const pending = [];
  for (const [id, map] of Object.entries(spec.maps)) {
    for (const side of SIDES) {
      const target = exitTarget(map.exits?.[side]);
      if (!target?.zone || target.zone === zone) continue;
      const other = specs[target.zone]?.maps?.[target.map];
      const back = other && Object.values(other.exits ?? {}).some((e) => exitTarget(e)?.zone === zone && exitTarget(e).map === id);
      if (!back) pending.push({map: id, side, zone: target.zone, target: target.map});
    }
  }
  return pending;
}

// ---- Unit types ----

// A library unit type copied into a world: its token paths rewritten from
// libraryFile (relative to the content root) to the world's unit_types/,
// and the token files to copy as [from, to] (from relative to the content
// root, to relative to the world).
export function worldUnitType(data, libraryFile) {
  const dir = libraryFile.split("/").slice(0, -1);
  const tokens = [];
  const rewrite = (url) => {
    if (typeof url !== "string" || /^[a-z]+:|^\//.test(url) || url.startsWith(":")) return url;
    const from = normalize([...dir, ...url.split("/")]);
    if (!from.startsWith("tokens/")) return url;
    tokens.push([from, from]);
    return `../${from}`;
  };
  const tokenImageUrl = Array.isArray(data.tokenImageUrl) ? data.tokenImageUrl.map(rewrite) : rewrite(data.tokenImageUrl);
  return {data: {...data, tokenImageUrl}, tokens};
}

function normalize(parts) {
  const out = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part && part !== ".") out.push(part);
  }
  return out.join("/");
}

const same = (a, b) => a.zone === b.zone && a.kind === b.kind && a.connection === b.connection;
const titleOf = (id) => id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const round = (n) => Math.round(n * 100) / 100;
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
