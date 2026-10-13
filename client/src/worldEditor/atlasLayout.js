// A first guess at a world's atlas (docs/schema/world.md#atlas): where each
// zone's maps sit geographically, for the author to adjust from.
//
// Maps are laid out a zone at a time, walking its zoneLinks: each map is set
// beside the one it links from, MAP_GAP feet past the edge that map's
// connection is on, lined up along it so the two connections face each
// other. A map that would overlap (or crowd) one already placed is pushed
// further out the same way. A zone's maps that link to nothing it has go
// east of the rest. Each zone's outline is then the rectangle around its
// maps, ZONE_MARGIN feet clear of them, and zones are laid out the same
// way as maps, ZONE_GAP feet apart, walking the worldLinks, so linked maps
// face each other across zone edges. Zones linked to nothing go east of the
// rest. The gaps leave room to see the links.
//
// Input: {zones: {key: {maps, zoneLinks, openConnections}}, worldLinks},
// each map {identifier, feetDimensions, connections} as in its map file.
// Positions are rounded to whole feet.

const MAP_GAP = 60; // feet between maps
const ZONE_MARGIN = 60; // feet between a zone's outline and its maps
const ZONE_GAP = 120; // feet between zones

// The side of a map (feet: width x height, origin at its south-west
// corner, y north) nearest to a point on it.
function nearestSide(point, width, height) {
  const sides = [
    ["west", point.x / Math.max(width, 1)],
    ["east", (width - point.x) / Math.max(width, 1)],
    ["south", point.y / Math.max(height, 1)],
    ["north", (height - point.y) / Math.max(height, 1)],
  ];
  return sides.reduce((best, side) => (side[1] < best[1] ? side : best))[0];
}

// Where on its map a connection is: a line's midpoint, or a point's
// position. Null for a connection that isn't there.
export function connectionPoint(map, identifier) {
  const conn = (map?.connections ?? []).find((c) => c.identifier === identifier);
  if (!conn) return null;
  if (conn.start && conn.end) return {x: (conn.start.x + conn.end.x) / 2, y: (conn.start.y + conn.end.y) / 2};
  return conn.position ? {x: conn.position.x, y: conn.position.y} : null;
}

const size = (map) => ({width: map?.feetDimensions?.width ?? 0, height: map?.feetDimensions?.height ?? 0});

function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

const grown = (r, by) => ({x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by});

// Pushes rect out along side until it's at least gap from all of placed.
function pushClear(rect, side, placed, gap) {
  const moved = {...rect};
  const blocking = () => placed.find((p) => overlaps(grown(moved, gap - 1e-6), p));
  for (let blocker = blocking(); blocker; blocker = blocking()) {
    if (side === "north") moved.y = blocker.y + blocker.height + gap;
    else if (side === "south") moved.y = blocker.y - moved.height - gap;
    else if (side === "east") moved.x = blocker.x + blocker.width + gap;
    else moved.x = blocker.x - moved.width - gap;
  }
  return moved;
}

// Where `to` (width x height) goes beside `from` (a placed rect), so that
// fromPoint (on from, in its own feet) faces toPoint (on to): gap past the
// side of from that fromPoint is nearest, lined up along it.
function besideRect(from, fromPoint, to, toPoint, gap) {
  const side = nearestSide(fromPoint, from.width, from.height);
  const x = side === "east" ? from.x + from.width + gap : side === "west" ? from.x - to.width - gap : from.x + fromPoint.x - toPoint.x;
  const y = side === "north" ? from.y + from.height + gap : side === "south" ? from.y - to.height - gap : from.y + fromPoint.y - toPoint.y;
  return {rect: {x: Math.round(x), y: Math.round(y), width: to.width, height: to.height}, side};
}

const eastOf = (placed, rect, gap) => ({...rect, x: placed.length ? Math.max(...placed.map((p) => p.x + p.width)) + gap : 0, y: 0});

// Lays out nodes ({key, width, height}) walking edges ({a, b, aPoint,
// bPoint}: aPoint on a, bPoint on b, both in their own feet), each
// component from its first node, components east of each other, each
// node at least gap from the rest. Returns {key: rect}.
function layOut(nodes, edges, gap) {
  const rects = {};
  const placed = [];
  const neighbors = (key) => edges.flatMap((e) => (e.a === key ? [{to: e.b, fromPoint: e.aPoint, toPoint: e.bPoint}] : e.b === key ? [{to: e.a, fromPoint: e.bPoint, toPoint: e.aPoint}] : []));
  const byKey = Object.fromEntries(nodes.map((n) => [n.key, n]));
  for (const root of nodes) {
    if (rects[root.key]) continue;
    rects[root.key] = eastOf(placed, {width: root.width, height: root.height}, gap);
    placed.push(rects[root.key]);
    const queue = [root.key];
    while (queue.length) {
      const key = queue.shift();
      for (const {to, fromPoint, toPoint} of neighbors(key)) {
        if (rects[to] || !byKey[to]) continue;
        const {rect, side} = besideRect(rects[key], fromPoint, byKey[to], toPoint, gap);
        rects[to] = pushClear(rect, side, placed, gap);
        placed.push(rects[to]);
        queue.push(to);
      }
    }
  }
  return rects;
}

// The zone's own map identifier and connection behind a world link side,
// or null when it doesn't resolve.
export function worldLinkEnd(zones, side) {
  const zone = zones[side?.zone];
  if (!zone) return null;
  let key = side.connection;
  if (side.kind === "open") key = Object.entries(zone.openConnections ?? {}).find(([, name]) => name === side.connection)?.[0];
  const slash = key?.indexOf("/") ?? -1;
  return slash === -1 ? null : {zone: side.zone, map: key.slice(0, slash), connection: key.slice(slash + 1)};
}

export function mapsByIdentifier(zone) {
  return Object.fromEntries((zone.maps ?? []).filter((m) => m?.identifier).map((m) => [m.identifier, m]));
}

// Lays one zone's maps out; returns {identifier: rect}, with the bounds
// starting at (0, 0).
function layOutZone(zone) {
  const maps = mapsByIdentifier(zone);
  const nodes = Object.values(maps).map((m) => ({key: m.identifier, ...size(m)}));
  const edges = (zone.zoneLinks ?? []).flatMap((link) => {
    const a = link.connectionA, b = link.connectionB;
    const aPoint = connectionPoint(maps[a?.map], a?.connection), bPoint = connectionPoint(maps[b?.map], b?.connection);
    return aPoint && bPoint && a.map !== b.map ? [{a: a.map, b: b.map, aPoint, bPoint}] : [];
  });
  const rects = layOut(nodes, edges, MAP_GAP);
  const all = Object.values(rects);
  const minX = Math.min(0, ...all.map((r) => r.x)), minY = Math.min(0, ...all.map((r) => r.y));
  return Object.fromEntries(Object.entries(rects).map(([key, r]) => [key, {...r, x: r.x - minX, y: r.y - minY}]));
}

// The rectangle around rects (from (0, 0)), margin clear of them, with
// rects moved into it.
function rectAround(rects, margin) {
  const all = Object.values(rects);
  const width = Math.max(0, ...all.map((r) => r.x + r.width)) + 2 * margin;
  const height = Math.max(0, ...all.map((r) => r.y + r.height)) + 2 * margin;
  return {width, height, maps: Object.fromEntries(Object.entries(rects).map(([key, r]) => [key, {...r, x: r.x + margin, y: r.y + margin}]))};
}

export function guessAtlas({zones = {}, worldLinks = []}) {
  const boxes = Object.fromEntries(Object.entries(zones).map(([key, zone]) => [key, rectAround(layOutZone(zone), ZONE_MARGIN)]));

  // Zones are laid out like maps: a link between maps becomes one between
  // the zones' rectangles, at each map's connection as placed in its own.
  const zoneEdges = worldLinks.flatMap((link) => {
    const a = worldLinkEnd(zones, link.zoneA), b = worldLinkEnd(zones, link.zoneB);
    if (!a || !b || a.zone === b.zone) return [];
    const point = (end) => {
      const rect = boxes[end.zone].maps[end.map];
      const p = connectionPoint(mapsByIdentifier(zones[end.zone])[end.map], end.connection);
      return rect && p ? {x: rect.x + p.x, y: rect.y + p.y} : null;
    };
    const aPoint = point(a), bPoint = point(b);
    return aPoint && bPoint ? [{a: a.zone, b: b.zone, aPoint, bPoint}] : [];
  });
  const zoneRects = layOut(Object.entries(boxes).map(([key, b]) => ({key, width: b.width, height: b.height})), zoneEdges, ZONE_GAP);

  const atlasZones = {};
  for (const [key, {width, height, maps}] of Object.entries(boxes)) {
    const {x, y} = zoneRects[key];
    atlasZones[key] = {
      outline: [{x, y}, {x: x + width, y}, {x: x + width, y: y + height}, {x, y: y + height}],
      maps: Object.fromEntries(Object.entries(maps).map(([map, r]) => [map, {x: x + r.x, y: y + r.y}])),
    };
  }
  return {zones: atlasZones};
}

// A link's key in the atlas's bends: its two ends, "zone/map/connection",
// in sorted order, joined by "|".
export function linkKey(a, b) {
  return [`${a.zone}/${a.map}/${a.connection}`, `${b.zone}/${b.map}/${b.connection}`].sort().join("|");
}

// The atlas's link lines, in world feet: [{kind, key, from, to, through}],
// kind "zone" for a zoneLink, "world" for a worldLink, from and to the two
// connections as placed, through the point a bent link curves through
// (its midpoint plus its bend, see docs/schema/world.md#atlas), or null
// for a straight one. Links with an end not laid out are left out. zones
// and worldLinks as guessAtlas takes them.
export function atlasLinks(atlas, {zones = {}, worldLinks = []}) {
  const at = (zone, map, connection) => {
    const placed = atlas?.zones?.[zone]?.maps?.[map];
    const point = placed && connectionPoint(mapsByIdentifier(zones[zone] ?? {})[map], connection);
    return point ? {x: placed.x + point.x, y: placed.y + point.y} : null;
  };
  const lines = [];
  const add = (kind, a, b) => {
    const [from, to] = [at(a.zone, a.map, a.connection), at(b.zone, b.map, b.connection)];
    if (!from || !to) return;
    const key = linkKey(a, b);
    const bend = atlas?.bends?.[key];
    const through = bend ? {x: (from.x + to.x) / 2 + bend.x, y: (from.y + to.y) / 2 + bend.y} : null;
    lines.push({kind, key, from, to, through});
  };
  for (const [zone, data] of Object.entries(zones)) {
    for (const link of data.zoneLinks ?? []) {
      if (link.connectionA && link.connectionB) add("zone", {zone, ...link.connectionA}, {zone, ...link.connectionB});
    }
  }
  for (const link of worldLinks) {
    const [a, b] = [worldLinkEnd(zones, link.zoneA), worldLinkEnd(zones, link.zoneB)];
    if (a && b) add("world", a, b);
  }
  return lines;
}
