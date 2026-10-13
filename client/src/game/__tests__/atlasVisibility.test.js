import {describe, it, expect} from "vitest";
import {canvasProps} from "../../AtlasWindow";
import {placesByMap, visibleAtlas, visitKeys, visitsAt} from "../atlasVisibility";

const square = (x, y, size) => [{x, y}, {x: x + size, y}, {x: x + size, y: y + size}, {x, y: y + size}];
const payload = {
  zones: {
    forest: {name: "Forest", outline: square(0, 0, 400)},
    caves: {name: "Caves", outline: square(500, 0, 200)},
  },
  maps: [
    {zone: "forest", map: "camp", name: "Camp", x: 0, y: 0, width: 100, height: 100, places: [{identifier: "tents", polygon: square(0, 0, 50)}, {identifier: "pond", polygon: square(50, 50, 50)}]},
    {zone: "forest", map: "road", name: "Road", x: 200, y: 0, width: 100, height: 100, places: []},
    {zone: "caves", map: "mouth", name: "Mouth", x: 500, y: 0, width: 100, height: 100, places: []},
  ],
  links: [
    {kind: "zone", key: "camp-road", from: {x: 100, y: 25}, to: {x: 200, y: 25}, through: null, ends: [{zone: "forest", map: "camp"}, {zone: "forest", map: "road"}]},
    {kind: "zone", key: "road-camp", from: {x: 200, y: 75}, to: {x: 100, y: 75}, through: null, ends: [{zone: "forest", map: "road"}, {zone: "forest", map: "camp"}]},
    {kind: "world", key: "road-mouth", from: {x: 300, y: 50}, to: {x: 500, y: 50}, through: {x: 400, y: 150}, ends: [{zone: "forest", map: "road"}, {zone: "caves", map: "mouth"}]},
  ],
};
const show = (keys) => visibleAtlas({...canvasProps(payload), fog: [], stubs: []}, payload, new Set(keys));

describe("visitsAt", () => {
  const places = placesByMap(payload).forest.camp;

  it("is the zone, the map and every place around the player", () => {
    expect(visitsAt("forest", "camp", {x: 10, y: 10}, places)).toEqual(["forest", "forest/camp", "forest/camp/tents"]);
    expect(visitsAt("forest", "camp", {x: 90, y: 10}, places)).toEqual(["forest", "forest/camp"]);
  });

  it("is just the zone before the player is on a map", () => {
    expect(visitsAt("forest", undefined, null)).toEqual(["forest"]);
    expect(visitsAt(null, "camp", null)).toEqual([]);
  });
});

describe("visitKeys", () => {
  it("keys each visit as zone, zone/map or zone/map/place", () => {
    expect([...visitKeys([{zone: "forest", map: "", place: ""}, {zone: "forest", map: "camp", place: "tents"}])]).toEqual(["forest", "forest/camp/tents"]);
  });
});

describe("visibleAtlas", () => {
  it("leaves out zones and maps not visited, with their links", () => {
    const shown = show(["forest", "forest/road"]);
    expect(Object.keys(shown.atlas.zones)).toEqual(["forest"]);
    expect(Object.keys(shown.atlas.zones.forest.maps)).toEqual(["road"]);
    expect(shown.links).toEqual([]);
  });

  it("shows a link whole when both its maps are visited", () => {
    const shown = show(["forest", "forest/road", "forest/camp", "forest/camp/tents", "forest/camp/pond"]);
    expect(shown.links.map((l) => l.key)).toEqual(["camp-road", "road-camp"]);
  });

  it("makes a stub of a link to somewhere not visited, pointing its way", () => {
    const shown = show(["forest", "forest/road"]);
    const byKey = Object.fromEntries(shown.stubs.map((s) => [s.key, s]));
    expect(byKey["camp-road"]).toEqual({key: "camp-road", at: {x: 200, y: 25}, angle: -90});
    expect(byKey["road-camp"].at).toEqual({x: 200, y: 75});
    // Bent: toward the curve's control point, (400, 250).
    expect(byKey["road-mouth"].angle).toBeCloseTo(Math.atan2(100, 200) * 180 / Math.PI);
  });

  it("fogs a map but for its visited places until all are visited", () => {
    expect(show(["forest", "forest/camp"]).fog).toEqual([{key: "forest/camp", x: 0, y: 0, width: 100, height: 100, clear: []}]);
    expect(show(["forest", "forest/camp", "forest/camp/tents"]).fog[0].clear).toEqual([square(0, 0, 50)]);
    expect(show(["forest", "forest/camp", "forest/camp/tents", "forest/camp/pond"]).fog).toEqual([]);
    expect(show(["forest", "forest/road"]).fog).toEqual([]);
  });

  it("drops a stub whose end is under fog", () => {
    // camp-road leaves camp at (100, 25): in no place, so fogged until both are visited.
    const shown = show(["forest", "forest/camp", "forest/camp/tents"]);
    expect(shown.stubs.map((s) => s.key)).toEqual([]);
    const clear = show(["forest", "forest/camp", "forest/camp/tents", "forest/camp/pond"]);
    expect(clear.stubs.map((s) => s.key)).toEqual(["camp-road", "road-camp"]);
  });
});
