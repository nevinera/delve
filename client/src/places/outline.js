// A zone's outline: the compact view of it an LLM works from when building
// a zone in layers (see plans/places.md), instead of the raw maps. Each map
// is a graph of its places (see docs/schema/map.md#place), adjacent where
// open ground passes from one to the other; the zone is a graph of maps,
// through its zoneLinks, each end saying which place it opens into. The
// zone's, unit types', maps', places', units', NCUs' and interactables'
// annotations come
// along (see docs/schema/common.md#annotations). Pure; bin/zone-outline
// prints it.
import {STEP, placeGrid} from "./ground";
import {hasLineOfSight} from "../game/collision";
import {CELL_SIZE, geometryOf} from "../cellMap/grid";
import {terrainAt, terrainLabel} from "../cellMap/format";

// How far, in feet, a connection or unit may be from open ground in a place
// and still count as in it.
const REACH = 7.5;
// Open ground in no place goes unmentioned under this share of it all: the
// slivers left where places' outlines and the walls bend differently.
const SLIVERS = 0.02;
// A place's terrains go unmentioned under this share of its cells.
const TERRAIN_SHARE = 0.1;

// {zone, unitTypes, maps, links, entryPoints, openConnections}; see
// outlineMap for each map's.
export function outlineZone(zone) {
  const maps = (zone.maps ?? []).filter((map) => map && !map.$ref).map(outlineMap);
  const byId = new Map(maps.map((map) => [map.identifier, map]));
  const placeOf = ({map, connection}) => byId.get(map)?.connections.find((c) => c.identifier === connection)?.place ?? null;
  const end = (ref) => compact({map: ref.map, connection: ref.connection, place: placeOf(ref)});
  return compact({
    zone: compact({name: zone.name, description: zone.description, elvl: zone.elvl, private: zone.private, annotations: notes(zone.annotations)}),
    unitTypes: Object.fromEntries(Object.entries(zone.unitTypes ?? {}).map(([key, type]) => [key, type?.$ref ? {ref: type.$ref} : compact({name: type.name, description: type.description, maxHP: type.maxHP, dps: type.dps, annotations: notes(type.annotations)})])),
    maps,
    links: (zone.zoneLinks ?? []).map((link) => compact({a: end(link.connectionA), b: end(link.connectionB), oneWay: link.oneWay || undefined, requiredKey: link.requiredKey ?? undefined})),
    entryPoints: zone.entryPoints && Object.keys(zone.entryPoints),
    openConnections: zone.openConnections,
  });
}

// A map's places, each with its open ground's area (square feet), the
// places next to it, and the units, NCUs and interactables in it; its
// connections, each with the place it opens into; its annotated units, NCUs
// and interactables, each with
// the place it's in; and the open ground in no place.
export function outlineMap(map) {
  const places = map.places ?? [];
  const {width, height} = map.feetDimensions ?? {};
  const out = compact({identifier: map.identifier, name: map.name, elvl: map.elvl, size: width && height ? {width: round(width), height: round(height)} : undefined, theme: map.cellMap?.theme, units: counts(map.units), annotations: notes(map.annotations)});
  if (!width || !height) {
    return compact({...out, places: places.map(describe), connections: (map.connections ?? []).map(({identifier, type}) => ({identifier, type, place: null})), annotated: annotated(map, () => null)});
  }

  const {cols, rows, label, center} = placeGrid(map);

  const area = new Float64Array(places.length);
  let unplaced = 0;
  const walls = (map.barriers ?? []).map((b) => ({...b, blocksSight: true}));
  const adjacent = places.map(() => new Set());
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const own = label[r * cols + c];
      if (own === -2) continue;
      if (own === -1) unplaced += STEP * STEP;
      else area[own] += STEP * STEP;
      if (own < 0) continue;
      for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const [nc, nr] = [c + dc, r + dr];
        if (nc >= cols || nr < 0 || nr >= rows) continue;
        const other = label[nr * cols + nc];
        if (other < 0 || other === own || adjacent[own].has(other)) continue;
        if (!hasLineOfSight(...center(c, r), ...center(nc, nr), walls)) continue;
        adjacent[own].add(other);
        adjacent[other].add(own);
      }
    }
  }

  // The place of the open ground nearest a point, within REACH.
  const nearest = (x, y) => {
    let best = null;
    const reach = Math.ceil(REACH / STEP);
    const [c0, r0] = [Math.floor(x / STEP), Math.floor(y / STEP)];
    for (let r = r0 - reach; r <= r0 + reach; r++) {
      for (let c = c0 - reach; c <= c0 + reach; c++) {
        if (c < 0 || r < 0 || c >= cols || r >= rows || label[r * cols + c] < 0) continue;
        const [px, py] = center(c, r);
        const d = Math.hypot(px - x, py - y);
        if (d <= REACH && (!best || d < best.d)) best = {d, place: label[r * cols + c]};
      }
    }
    return best ? places[best.place].identifier : null;
  };

  const tally = (list, key) => {
    const counts = places.map(() => ({}));
    for (const entry of list ?? []) {
      if (!entry.position) continue;
      const i = places.findIndex((p) => p.identifier === nearest(entry.position.x, entry.position.y));
      if (i < 0) continue;
      const k = key(entry);
      counts[i][k] = (counts[i][k] ?? 0) + 1;
    }
    return counts;
  };
  // Where each place sits, from its open ground's middle: the map in
  // thirds, north up.
  const middle = places.map(() => ({x: 0, y: 0, n: 0}));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const own = label[r * cols + c];
      if (own < 0) continue;
      const [x, y] = center(c, r);
      Object.assign(middle[own], {x: middle[own].x + x, y: middle[own].y + y, n: middle[own].n + 1});
    }
  }
  const at = middle.map(({x, y, n}) => (n ? compass(x / n / width, y / n / height) : undefined));
  const {terrains, trails} = map.cellMap ? cellFeatures(map.cellMap, height, (x, y) => {
    const [c, r] = [Math.floor(x / STEP), Math.floor(y / STEP)];
    return c >= 0 && r >= 0 && c < cols && r < rows ? label[r * cols + c] : -2;
  }, places.length) : {};

  const units = tally(map.units, (u) => u.unitType);
  const ncus = tally(map.ncus, (n) => n.identifier);
  const interactables = tally(map.interactables, (n) => n.identifier);

  return {
    ...out,
    places: places.map((place, i) => compact({
      ...describe(place),
      area: Math.round(area[i]),
      at: at[i],
      terrain: terrains?.[i],
      trail: trails?.[i] || undefined,
      adjacent: [...adjacent[i]].sort((a, b) => a - b).map((j) => places[j].identifier),
      units: Object.keys(units[i]).length ? units[i] : undefined,
      ncus: Object.keys(ncus[i]).length ? Object.keys(ncus[i]) : undefined,
      interactables: Object.keys(interactables[i]).length ? Object.keys(interactables[i]) : undefined,
    })),
    connections: (map.connections ?? []).map((c) => {
      const at = c.type === "line" && c.start && c.end ? {x: (c.start.x + c.end.x) / 2, y: (c.start.y + c.end.y) / 2} : c.location ?? c.position;
      return {identifier: c.identifier, type: c.type, place: at ? nearest(at.x, at.y) : null};
    }),
    ...compact({annotated: annotated(map, (p) => (p ? nearest(p.x, p.y) : null))}),
    ...(places.length && unplaced > SLIVERS * (unplaced + area.reduce((a, b) => a + b, 0)) ? {unplacedArea: Math.round(unplaced)} : {}),
  };
}

// "north-west" ... "middle" ... "south-east", for a point as a share of
// the map's width and height (y up, as map feet are).
function compass(fx, fy) {
  const ns = fy > 2 / 3 ? "north" : fy < 1 / 3 ? "south" : "";
  const ew = fx < 1 / 3 ? "west" : fx > 2 / 3 ? "east" : "";
  return [ns, ew].filter(Boolean).join("-") || "middle";
}

// From the cellMap: each place's open terrains, by share of its cells
// ("meadow 70%, marsh 20%"), and whether a trail runs through it. labelAt
// gives the place index at map feet (y up).
function cellFeatures(cellMap, height, labelAt, count) {
  const tallies = Array.from({length: count}, () => ({}));
  const totals = new Array(count).fill(0);
  cellMap.cells.forEach((line, row) => [...line].forEach((_, col) => {
    const {x, y} = geometryOf(cellMap.grid).cellCenter(col, row, CELL_SIZE);
    const own = labelAt(x, height - y);
    if (own < 0) return;
    const terrain = terrainLabel(cellMap.theme, terrainAt(cellMap, col, row));
    tallies[own][terrain] = (tallies[own][terrain] ?? 0) + 1;
    totals[own]++;
  }));
  const terrains = tallies.map((tally, i) => {
    const shares = Object.entries(tally).map(([t, n]) => [t, n / totals[i]]).filter(([, f]) => f >= TERRAIN_SHARE).sort((a, b) => b[1] - a[1]);
    return shares.length ? shares.map(([t, f]) => `${t} ${Math.round(f * 100)}%`).join(", ") : undefined;
  });
  const trails = new Array(count).fill(false);
  for (const {points} of cellMap.trails ?? []) {
    for (let i = 0; i + 1 < points.length; i++) {
      const a = geometryOf(cellMap.grid).cellPoint(...points[i], CELL_SIZE);
      const b = geometryOf(cellMap.grid).cellPoint(...points[i + 1], CELL_SIZE);
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / STEP);
      for (let k = 0; k <= steps; k++) {
        const own = labelAt(a.x + ((b.x - a.x) * k) / steps, height - (a.y + ((b.y - a.y) * k) / steps));
        if (own >= 0) trails[own] = true;
      }
    }
  }
  return {terrains, trails};
}

// The map's units, NCUs and interactables that have annotations, each with the place it's
// in (placeAt(position)), or undefined for none.
function annotated(map, placeAt) {
  const list = [
    ...(map.units ?? []).map((u) => ({kind: "unit", identifier: u.identifier, unitType: u.unitType, position: u.position, annotations: notes(u.annotations)})),
    ...(map.ncus ?? []).map((n) => ({kind: "ncu", identifier: n.identifier, name: n.name, position: n.position, annotations: notes(n.annotations)})),
    ...(map.interactables ?? []).map((n) => ({kind: "interactable", identifier: n.identifier, name: n.name, position: n.position, annotations: notes(n.annotations)})),
  ].filter((entry) => entry.annotations);
  if (!list.length) return undefined;
  return list.map(({position, ...entry}) => compact({...entry, place: placeAt(position)}));
}

// A short text form of the outline, for reading or pasting into a prompt.
export function outlineText(outline) {
  const lines = [];
  const {zone} = outline;
  lines.push(`Zone: ${zone.name ?? "(unnamed)"}${zone.elvl !== undefined ? `, elvl ${zone.elvl}` : ""}${zone.private ? ", private" : ""}`);
  if (zone.description) lines.push(`  ${zone.description}`);
  noteLines(lines, zone.annotations, "  ");
  const types = Object.entries(outline.unitTypes ?? {});
  if (types.length) lines.push(`Unit types: ${types.map(([key, t]) => (t.name ? `${key} (${t.name})` : key)).join(", ")}`);
  for (const [key, type] of types) {
    if (!type.annotations) continue;
    lines.push(`  ${key}:`);
    noteLines(lines, type.annotations, "    ");
  }
  for (const map of outline.maps) {
    lines.push("");
    const size = map.size ? `, ${map.size.width}x${map.size.height} ft` : "";
    lines.push(`Map ${map.identifier}${map.name ? ` "${map.name}"` : ""}${size}${map.theme ? `, ${map.theme}` : ""}`);
    noteLines(lines, map.annotations, "  ");
    if (map.units) lines.push(`  units: ${unitList(map.units)}`);
    if (!map.places.length) lines.push("  (no places)");
    for (const place of map.places) {
      const tags = place.tags?.length ? ` [${place.tags.join(", ")}]` : "";
      const area = place.area !== undefined ? `, ${place.area} sq ft` : "";
      const where = [place.at, place.terrain, place.trail && "trail"].filter(Boolean).join("; ");
      lines.push(`  ${place.identifier}${place.name ? ` "${place.name}"` : ""}${tags}${area}${where ? ` (${where})` : ""}`);
      if (place.description) lines.push(`    ${place.description}`);
      if (place.adjacent?.length) lines.push(`    next to: ${place.adjacent.join(", ")}`);
      const exits = map.connections.filter((c) => c.place === place.identifier).map((c) => c.identifier);
      if (exits.length) lines.push(`    connections: ${exits.join(", ")}`);
      if (place.units) lines.push(`    units: ${unitList(place.units)}`);
      if (place.ncus) lines.push(`    ncus: ${place.ncus.join(", ")}`);
      if (place.interactables) lines.push(`    interactables: ${place.interactables.join(", ")}`);
      noteLines(lines, place.annotations, "    ");
      for (const entry of (map.annotated ?? []).filter((e) => e.place === place.identifier)) annotatedLines(lines, entry, "    ");
    }
    for (const entry of (map.annotated ?? []).filter((e) => !e.place)) annotatedLines(lines, entry, "  ");
    const loose = map.connections.filter((c) => !c.place).map((c) => c.identifier);
    if (loose.length && map.places.length) lines.push(`  connections in no place: ${loose.join(", ")}`);
    if (map.unplacedArea) lines.push(`  open ground in no place: ${map.unplacedArea} sq ft`);
  }
  if (outline.links?.length) {
    lines.push("", "Links:");
    const end = (e) => `${e.map}/${e.connection}${e.place ? ` (${e.place})` : ""}`;
    for (const link of outline.links) lines.push(`  ${end(link.a)} ${link.oneWay ? "->" : "<->"} ${end(link.b)}${link.requiredKey ? `, needs ${link.requiredKey}` : ""}`);
  }
  if (outline.entryPoints?.length) lines.push("", `Entry points: ${outline.entryPoints.join(", ")}`);
  const opens = Object.entries(outline.openConnections ?? {});
  if (opens.length) lines.push("", `Open connections: ${opens.map(([key, name]) => `${key} as ${name}`).join(", ")}`);
  return lines.join("\n") + "\n";
}

const unitList = (units) => Object.entries(units).map(([type, n]) => `${type} x${n}`).join(", ");

// An annotation per line, `key: text`, a long text's later lines indented
// under it.
function noteLines(lines, annotations, indent) {
  for (const [key, text] of Object.entries(annotations ?? {})) {
    const [first, ...rest] = text.split("\n");
    lines.push(`${indent}${key}: ${first}`);
    for (const line of rest) lines.push(`${indent}  ${line}`);
  }
}

function annotatedLines(lines, entry, indent) {
  const label = entry.kind === "unit" ? `unit ${entry.identifier} (${entry.unitType})` : `${entry.kind} ${entry.identifier}${entry.name ? ` "${entry.name}"` : ""}`;
  lines.push(`${indent}${label}:`);
  noteLines(lines, entry.annotations, `${indent}  `);
}

// ---- Shape ----

// Units by type, or undefined for none.
function counts(units) {
  if (!units?.length) return undefined;
  const out = {};
  for (const {unitType} of units) out[unitType] = (out[unitType] ?? 0) + 1;
  return out;
}

function describe({identifier, name, description, tags, annotations}) {
  return compact({identifier, name, description, tags: tags?.length ? tags : undefined, annotations: notes(annotations)});
}

// Annotations, or undefined for none.
const notes = (annotations) => (annotations && Object.keys(annotations).length ? annotations : undefined);

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== null));
}

const round = (n) => Math.round(n * 10) / 10;
