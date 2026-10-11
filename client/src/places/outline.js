// A zone's outline: the compact view of it an LLM works from when building
// a zone in layers (see plans/places.md), instead of the raw maps. Each map
// is a graph of its places (see docs/schema/map.md#place), adjacent where
// open ground passes from one to the other; the zone is a graph of maps,
// through its zoneLinks, each end saying which place it opens into. Pure;
// bin/zone-outline prints it.
import {computeMapFill} from "../game/mapFill";
import {hasLineOfSight} from "../game/collision";

// Feet between the points open ground is sampled at.
const STEP = 2.5;
// How far, in feet, a connection or unit may be from open ground in a place
// and still count as in it.
const REACH = 7.5;
// Open ground in no place goes unmentioned under this share of it all: the
// slivers left where places' outlines and the walls bend differently.
const SLIVERS = 0.02;

// {zone, unitTypes, maps, links, entryPoints, openConnections}; see
// outlineMap for each map's.
export function outlineZone(zone) {
  const maps = (zone.maps ?? []).filter((map) => map && !map.$ref).map(outlineMap);
  const byId = new Map(maps.map((map) => [map.identifier, map]));
  const placeOf = ({map, connection}) => byId.get(map)?.connections.find((c) => c.identifier === connection)?.place ?? null;
  const end = (ref) => compact({map: ref.map, connection: ref.connection, place: placeOf(ref)});
  return compact({
    zone: compact({name: zone.name, description: zone.description, elvl: zone.elvl, private: zone.private}),
    unitTypes: Object.fromEntries(Object.entries(zone.unitTypes ?? {}).map(([key, type]) => [key, type?.$ref ? {ref: type.$ref} : compact({name: type.name, description: type.description, maxHP: type.maxHP, dps: type.dps})])),
    maps,
    links: (zone.zoneLinks ?? []).map((link) => compact({a: end(link.connectionA), b: end(link.connectionB), oneWay: link.oneWay || undefined, requiredKey: link.requiredKey ?? undefined})),
    entryPoints: zone.entryPoints && Object.keys(zone.entryPoints),
    openConnections: zone.openConnections,
  });
}

// A map's places, each with its open ground's area (square feet), the
// places next to it, and the units and NCUs in it; its connections, each
// with the place it opens into; and the open ground in no place.
export function outlineMap(map) {
  const places = map.places ?? [];
  const {width, height} = map.feetDimensions ?? {};
  const out = compact({identifier: map.identifier, name: map.name, elvl: map.elvl, size: width && height ? {width: round(width), height: round(height)} : undefined, theme: map.cellMap?.theme, units: counts(map.units)});
  if (!width || !height) return {...out, places: places.map(describe), connections: (map.connections ?? []).map(({identifier, type}) => ({identifier, type, place: null}))};

  const open = openGround(map);
  const sizes = places.map((p) => polygonArea(p.polygon));
  const boxes = places.map((p) => box(p.polygon));
  // The smallest place around a point is the one it's in.
  const placeAt = (x, y) => {
    let best = -1;
    for (let i = 0; i < places.length; i++) {
      const b = boxes[i];
      if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) continue;
      if ((best < 0 || sizes[i] < sizes[best]) && inPolygon(x, y, places[i].polygon)) best = i;
    }
    return best;
  };

  const cols = Math.ceil(width / STEP);
  const rows = Math.ceil(height / STEP);
  const label = new Int32Array(cols * rows).fill(-2); // -2 filled, -1 open in no place
  const center = (c, r) => [(c + 0.5) * STEP, (r + 0.5) * STEP];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [x, y] = center(c, r);
      if (open(x, y)) label[r * cols + c] = placeAt(x, y);
    }
  }

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
  const units = tally(map.units, (u) => u.unitType);
  const ncus = tally(map.ncus, (n) => n.identifier);

  return {
    ...out,
    places: places.map((place, i) => compact({
      ...describe(place),
      area: Math.round(area[i]),
      adjacent: [...adjacent[i]].sort((a, b) => a - b).map((j) => places[j].identifier),
      units: Object.keys(units[i]).length ? units[i] : undefined,
      ncus: Object.keys(ncus[i]).length ? Object.keys(ncus[i]) : undefined,
    })),
    connections: (map.connections ?? []).map((c) => {
      const at = c.type === "line" && c.start && c.end ? {x: (c.start.x + c.end.x) / 2, y: (c.start.y + c.end.y) / 2} : c.location ?? c.position;
      return {identifier: c.identifier, type: c.type, place: at ? nearest(at.x, at.y) : null};
    }),
    ...(places.length && unplaced > SLIVERS * (unplaced + area.reduce((a, b) => a + b, 0)) ? {unplacedArea: Math.round(unplaced)} : {}),
  };
}

// A short text form of the outline, for reading or pasting into a prompt.
export function outlineText(outline) {
  const lines = [];
  const {zone} = outline;
  lines.push(`Zone: ${zone.name ?? "(unnamed)"}${zone.elvl !== undefined ? `, elvl ${zone.elvl}` : ""}${zone.private ? ", private" : ""}`);
  if (zone.description) lines.push(`  ${zone.description}`);
  const types = Object.entries(outline.unitTypes ?? {});
  if (types.length) lines.push(`Unit types: ${types.map(([key, t]) => (t.name ? `${key} (${t.name})` : key)).join(", ")}`);
  for (const map of outline.maps) {
    lines.push("");
    const size = map.size ? `, ${map.size.width}x${map.size.height} ft` : "";
    lines.push(`Map ${map.identifier}${map.name ? ` "${map.name}"` : ""}${size}${map.theme ? `, ${map.theme}` : ""}`);
    if (map.units) lines.push(`  units: ${unitList(map.units)}`);
    if (!map.places.length) lines.push("  (no places)");
    for (const place of map.places) {
      const tags = place.tags?.length ? ` [${place.tags.join(", ")}]` : "";
      const area = place.area !== undefined ? `, ${place.area} sq ft` : "";
      lines.push(`  ${place.identifier}${place.name ? ` "${place.name}"` : ""}${tags}${area}`);
      if (place.description) lines.push(`    ${place.description}`);
      if (place.adjacent?.length) lines.push(`    next to: ${place.adjacent.join(", ")}`);
      const exits = map.connections.filter((c) => c.place === place.identifier).map((c) => c.identifier);
      if (exits.length) lines.push(`    connections: ${exits.join(", ")}`);
      if (place.units) lines.push(`    units: ${unitList(place.units)}`);
      if (place.ncus) lines.push(`    ncus: ${place.ncus.join(", ")}`);
      for (const [key, text] of Object.entries(place.annotations ?? {})) lines.push(`    ${key}: ${text}`);
    }
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

// ---- Geometry ----

// Whether a point (feet) is open ground: on the map and not in its fill.
function openGround(map) {
  const fill = computeMapFill(map);
  const regions = fill.filled.map(({outer, holes}) => ({outer, holes, box: box(outer.map(([x, y]) => ({x, y})))}));
  const inRing = (x, y, ring) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [[ax, ay], [bx, by]] = [ring[i], ring[j]];
      if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) hit = !hit;
    }
    return hit;
  };
  return (x, y) => !regions.some(({outer, holes, box: b}) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && inRing(x, y, outer) && !holes.some((h) => inRing(x, y, h)));
}

function inPolygon(x, y, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [a, b] = [polygon[i], polygon[j]];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function polygonArea(polygon) {
  let sum = 0;
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  });
  return Math.abs(sum) / 2;
}

function box(points) {
  return {
    minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)), maxY: Math.max(...points.map((p) => p.y)),
  };
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
  return compact({identifier, name, description, tags: tags?.length ? tags : undefined, annotations: annotations && Object.keys(annotations).length ? annotations : undefined});
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== null));
}

const round = (n) => Math.round(n * 10) / 10;
