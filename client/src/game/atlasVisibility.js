import {inside} from "../worldEditor/atlasGeometry";

// What the in-game map shows of the atlas, from where the character has
// been (see plans/map-visits.md). Visits are keys: "zone", "zone/map" and
// "zone/map/place".
//
// - A zone shows once visited, and a map once visited.
// - A link shows when both its maps do. With only one, it's a stub: a dot
//   where it leaves that map, pointing the way it goes, when that spot
//   isn't fogged.
// - A shown map is fogged except for its visited places, until every place
//   on it is visited (ground in no place shows only then). A map with no
//   places shows whole.

export const visitKey = (zone, map = "", place = "") => [zone, map, place].filter(Boolean).join("/");

export function visitKeys(visits) {
  return new Set((visits ?? []).map((v) => visitKey(v.zone, v.map, v.place)));
}

// The visit key a game server "visited" message is for, or null for any
// other message.
export function visitedMessageKey(msg) {
  return msg?.type === "visited" && msg.zone ? visitKey(msg.zone, msg.map, msg.place) : null;
}

// The fog over a shown map: null when there's none, else the visited
// places' polygons in world feet, which stay clear.
function fogFor(m, visited) {
  const places = m.places ?? [];
  if (places.every((p) => visited.has(visitKey(m.zone, m.map, p.identifier)))) return null;
  return places.filter((p) => visited.has(visitKey(m.zone, m.map, p.identifier))).map((p) => p.polygon.map((q) => ({x: m.x + q.x, y: m.y + q.y})));
}

// The way a link leaves its from end: toward its curve's control point
// when bent, else toward its other end. Degrees clockwise from north.
function heading(from, to, through) {
  const toward = through ? {x: 2 * through.x - (from.x + to.x) / 2, y: 2 * through.y - (from.y + to.y) / 2} : to;
  return (Math.atan2(toward.x - from.x, toward.y - from.y) * 180) / Math.PI;
}

// props is canvasProps's (see AtlasWindow); payload the atlas it came from.
// Returns the props with what isn't visited taken out, plus fog
// ([{x, y, width, height, clear}]) and stubs ([{key, at, angle}]).
export function visibleAtlas(props, payload, visited) {
  const atlas = {zones: {}};
  for (const [zone, entry] of Object.entries(props.atlas.zones)) {
    if (!visited.has(visitKey(zone))) continue;
    atlas.zones[zone] = {...entry, maps: Object.fromEntries(Object.entries(entry.maps).filter(([map]) => visited.has(visitKey(zone, map))))};
  }
  const shown = (end) => !!atlas.zones[end.zone]?.maps[end.map];

  const fog = [];
  const fogged = {};
  for (const m of payload?.maps ?? []) {
    if (!shown(m)) continue;
    const clear = fogFor(m, visited);
    if (!clear) continue;
    fog.push({key: `${m.zone}/${m.map}`, x: m.x, y: m.y, width: m.width, height: m.height, clear});
    (fogged[m.zone] ??= {})[m.map] = clear;
  }
  const underFog = (end, point) => {
    const clear = fogged[end.zone]?.[end.map];
    return !!clear && !clear.some((polygon) => inside(point, polygon, {boundary: true}));
  };

  const links = [];
  const stubs = [];
  for (const link of props.links) {
    const [a, b] = [shown(link.ends[0]), shown(link.ends[1])];
    if (a && b) links.push(link);
    else if (a && !underFog(link.ends[0], link.from)) stubs.push({key: link.key, at: link.from, angle: heading(link.from, link.to, link.through)});
    else if (b && !underFog(link.ends[1], link.to)) stubs.push({key: link.key, at: link.to, angle: heading(link.to, link.from, link.through)});
  }
  return {...props, atlas, links, fog, stubs};
}
