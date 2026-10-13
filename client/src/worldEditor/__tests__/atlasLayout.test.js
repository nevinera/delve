import {describe, it, expect} from "vitest";
import {guessAtlas} from "../atlasLayout";

const line = (identifier, x1, y1, x2, y2) => ({identifier, type: "line", start: {x: x1, y: y1}, end: {x: x2, y: y2}});
const map = (identifier, width, height, connections = []) => ({identifier, feetDimensions: {width, height}, connections});
const link = (mapA, connA, mapB, connB) => ({connectionA: {map: mapA, connection: connA}, connectionB: {map: mapB, connection: connB}, oneWay: false, requiredKey: null});

function rects(atlas, zones) {
  return Object.entries(atlas.zones).flatMap(([zone, {maps}]) => Object.entries(maps).map(([id, {x, y}]) => {
    const m = zones[zone].maps.find((mm) => mm.identifier === id);
    return {id: `${zone}/${id}`, x, y, width: m.feetDimensions.width, height: m.feetDimensions.height};
  }));
}

function expectNoOverlaps(list) {
  for (const [i, a] of list.entries()) {
    for (const b of list.slice(i + 1)) {
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

describe("guessAtlas", () => {
  it("sets a linked map past the edge its connection is on, the connections meeting", () => {
    const zones = {forest: {
      maps: [map("camp", 100, 100, [line("north", 40, 100, 60, 100)]), map("road", 100, 50, [line("south", 20, 0, 40, 0)])],
      zoneLinks: [link("camp", "north", "road", "south")],
    }};
    const {maps} = guessAtlas({zones}).zones.forest;
    expect(maps.road.x - maps.camp.x).toBe(20);
    expect(maps.road.y - maps.camp.y).toBe(100);
  });

  it("works from either end of the link", () => {
    const zones = {forest: {
      maps: [map("road", 100, 50, [line("south", 20, 0, 40, 0)]), map("camp", 100, 100, [line("north", 40, 100, 60, 100)])],
      zoneLinks: [link("camp", "north", "road", "south")],
    }};
    const {maps} = guessAtlas({zones}).zones.forest;
    expect(maps.road.x - maps.camp.x).toBe(20);
    expect(maps.road.y - maps.camp.y).toBe(100);
  });

  it("pushes a map that would overlap one already placed further out", () => {
    const zones = {forest: {
      maps: [map("camp", 100, 100, [line("n1", 0, 100, 50, 100), line("n2", 50, 100, 100, 100)]), map("a", 100, 40, [line("s", 25, 0, 75, 0)]), map("b", 100, 40, [line("s", 25, 0, 75, 0)])],
      zoneLinks: [link("camp", "n1", "a", "s"), link("camp", "n2", "b", "s")],
    }};
    const {maps} = guessAtlas({zones}).zones.forest;
    expect(maps.b.y - maps.camp.y).toBe(140);
    expectNoOverlaps(rects(guessAtlas({zones}), zones));
  });

  it("puts maps that link to nothing east of the rest", () => {
    const zones = {forest: {maps: [map("camp", 100, 100), map("lonely", 50, 50)], zoneLinks: []}};
    const {maps} = guessAtlas({zones}).zones.forest;
    expect(maps.lonely.x - maps.camp.x).toBe(100);
  });

  it("outlines each zone with the smallest square around its maps, centered", () => {
    const zones = {forest: {maps: [map("camp", 100, 40)], zoneLinks: []}};
    const {outline, maps} = guessAtlas({zones}).zones.forest;
    expect(outline).toEqual([{x: 0, y: 0}, {x: 100, y: 0}, {x: 100, y: 100}, {x: 0, y: 100}]);
    expect(maps.camp).toEqual({x: 0, y: 30});
  });

  it("sets linked zones beside each other, through their open connections and entry points", () => {
    const zones = {
      forest: {maps: [map("camp", 100, 100, [line("east", 100, 40, 100, 60)])], zoneLinks: [], openConnections: {"camp/east": "east-exit"}},
      cave: {maps: [map("mouth", 60, 60, [line("west", 0, 20, 0, 40)])], zoneLinks: [], openConnections: {}},
    };
    const worldLinks = [{zoneA: {zone: "forest", kind: "open", connection: "east-exit"}, zoneB: {zone: "cave", kind: "entryPoint", connection: "mouth/west"}, oneWay: false, requiredKey: null}];
    const atlas = guessAtlas({zones, worldLinks});
    expect(atlas.zones.cave.outline[0].x).toBe(100);
    expect(atlas.zones.cave.maps.mouth.y + 30).toBe(50); // the connections meet at y 50
    expectNoOverlaps(rects(atlas, zones));
  });

  it("puts zones linked to nothing east of the rest", () => {
    const zones = {forest: {maps: [map("camp", 100, 100)]}, cave: {maps: [map("mouth", 60, 60)]}};
    const atlas = guessAtlas({zones});
    expect(atlas.zones.cave.outline[0]).toEqual({x: 100, y: 0});
  });

  it("gives a zone with no maps a small square", () => {
    const atlas = guessAtlas({zones: {empty: {maps: []}}});
    expect(atlas.zones.empty).toEqual({outline: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}], maps: {}});
  });
});
