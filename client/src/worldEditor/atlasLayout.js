// A first guess at a world's atlas (docs/schema/world.md#atlas): where each
// zone's maps sit geographically, for the author to adjust from.
//
// Maps are laid out a zone at a time, walking its zoneLinks: each map is set
// beside the one it links from, past the edge that map's connection is on,
// lined up along it so the two connections meet. A map that would overlap
// one already placed is pushed further out the same way. A zone's maps that
// link to nothing it has go east of the rest. Each zone's outline is then
// the smallest square around its maps, and zones are laid out the same way
// as maps, walking the worldLinks, so linked maps face each other across
// zone edges. Zones linked to nothing go east of the rest.
//
// Input: {zones: {key: {maps, zoneLinks, openConnections}}, worldLinks},
// each map {identifier, feetDimensions, connections} as in its map file.
// Positions are rounded to whole feet.

const GAP = 0; // feet between unlinked maps (and zones) set side by side

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

// Pushes rect out along side until it overlaps none of placed.
function pushClear(rect, side, placed) {
  const moved = {...rect};
  for (let blocker = placed.find((p) => overlaps(moved, p)); blocker; blocker = placed.find((p) => overlaps(moved, p))) {
    if (side === "north") moved.y = blocker.y + blocker.height;
    else if (side === "south") moved.y = blocker.y - moved.height;
    else if (side === "east") moved.x = blocker.x + blocker.width;
    else moved.x = blocker.x - moved.width;
  }
  return moved;
}

// Where `to` (width x height) goes beside `from` (a placed rect), so that
// fromPoint (on from, in its own feet) meets toPoint (on to): past the side
// of from that fromPoint is nearest, lined up along it.
function besideRect(from, fromPoint, to, toPoint) {
  const side = nearestSide(fromPoint, from.width, from.height);
  const x = side === "east" ? from.x + from.width : side === "west" ? from.x - to.width : from.x + fromPoint.x - toPoint.x;
  const y = side === "north" ? from.y + from.height : side === "south" ? from.y - to.height : from.y + fromPoint.y - toPoint.y;
  return {rect: {x: Math.round(x), y: Math.round(y), width: to.width, height: to.height}, side};
}

const eastOf = (placed, rect) => ({...rect, x: placed.length ? Math.max(...placed.map((p) => p.x + p.width)) + GAP : 0, y: 0});

// Lays out nodes ({key, width, height}) walking edges ({a, b, aPoint,
// bPoint}: aPoint on a, bPoint on b, both in their own feet), each
// component from its first node, components east of each other. Returns
// {key: rect}.
function layOut(nodes, edges) {
  const rects = {};
  const placed = [];
  const neighbors = (key) => edges.flatMap((e) => (e.a === key ? [{to: e.b, fromPoint: e.aPoint, toPoint: e.bPoint}] : e.b === key ? [{to: e.a, fromPoint: e.bPoint, toPoint: e.aPoint}] : []));
  const byKey = Object.fromEntries(nodes.map((n) => [n.key, n]));
  for (const root of nodes) {
    if (rects[root.key]) continue;
    rects[root.key] = eastOf(placed, {width: root.width, height: root.height});
    placed.push(rects[root.key]);
    const queue = [root.key];
    while (queue.length) {
      const key = queue.shift();
      for (const {to, fromPoint, toPoint} of neighbors(key)) {
        if (rects[to] || !byKey[to]) continue;
        const {rect, side} = besideRect(rects[key], fromPoint, byKey[to], toPoint);
        rects[to] = pushClear(rect, side, placed);
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
  const rects = layOut(nodes, edges);
  const all = Object.values(rects);
  const minX = Math.min(0, ...all.map((r) => r.x)), minY = Math.min(0, ...all.map((r) => r.y));
  return Object.fromEntries(Object.entries(rects).map(([key, r]) => [key, {...r, x: r.x - minX, y: r.y - minY}]));
}

// The smallest square around rects (from (0, 0)), and rects centered in it.
function squareAround(rects) {
  const all = Object.values(rects);
  const width = Math.max(0, ...all.map((r) => r.x + r.width)), height = Math.max(0, ...all.map((r) => r.y + r.height));
  const side = Math.max(width, height, 1);
  const dx = Math.round((side - width) / 2), dy = Math.round((side - height) / 2);
  return {side, maps: Object.fromEntries(Object.entries(rects).map(([key, r]) => [key, {...r, x: r.x + dx, y: r.y + dy}]))};
}

export function guessAtlas({zones = {}, worldLinks = []}) {
  const squares = Object.fromEntries(Object.entries(zones).map(([key, zone]) => [key, squareAround(layOutZone(zone))]));

  // Zones are laid out like maps: a link between maps becomes one between
  // the zones' squares, at each map's connection as placed in its square.
  const zoneEdges = worldLinks.flatMap((link) => {
    const a = worldLinkEnd(zones, link.zoneA), b = worldLinkEnd(zones, link.zoneB);
    if (!a || !b || a.zone === b.zone) return [];
    const point = (end) => {
      const rect = squares[end.zone].maps[end.map];
      const p = connectionPoint(mapsByIdentifier(zones[end.zone])[end.map], end.connection);
      return rect && p ? {x: rect.x + p.x, y: rect.y + p.y} : null;
    };
    const aPoint = point(a), bPoint = point(b);
    return aPoint && bPoint ? [{a: a.zone, b: b.zone, aPoint, bPoint}] : [];
  });
  const zoneRects = layOut(Object.entries(squares).map(([key, s]) => ({key, width: s.side, height: s.side})), zoneEdges);

  const atlasZones = {};
  for (const [key, {side, maps}] of Object.entries(squares)) {
    const {x, y} = zoneRects[key];
    atlasZones[key] = {
      outline: [{x, y}, {x: x + side, y}, {x: x + side, y: y + side}, {x, y: y + side}],
      maps: Object.fromEntries(Object.entries(maps).map(([map, r]) => [map, {x: x + r.x, y: y + r.y}])),
    };
  }
  return {zones: atlasZones};
}

// The atlas's link lines, in world feet: [{kind, from, to}], kind "zone"
// for a zoneLink, "world" for a worldLink, from and to the two connections
// as placed. Links with an end not laid out are left out. zones and
// worldLinks as guessAtlas takes them.
export function atlasLinks(atlas, {zones = {}, worldLinks = []}) {
  const at = (zone, map, connection) => {
    const placed = atlas?.zones?.[zone]?.maps?.[map];
    const point = placed && connectionPoint(mapsByIdentifier(zones[zone] ?? {})[map], connection);
    return point ? {x: placed.x + point.x, y: placed.y + point.y} : null;
  };
  const lines = [];
  for (const [zone, data] of Object.entries(zones)) {
    for (const link of data.zoneLinks ?? []) {
      const [from, to] = [at(zone, link.connectionA?.map, link.connectionA?.connection), at(zone, link.connectionB?.map, link.connectionB?.connection)];
      if (from && to) lines.push({kind: "zone", from, to});
    }
  }
  for (const link of worldLinks) {
    const [a, b] = [worldLinkEnd(zones, link.zoneA), worldLinkEnd(zones, link.zoneB)];
    const [from, to] = [a && at(a.zone, a.map, a.connection), b && at(b.zone, b.map, b.connection)];
    if (from && to) lines.push({kind: "world", from, to});
  }
  return lines;
}
