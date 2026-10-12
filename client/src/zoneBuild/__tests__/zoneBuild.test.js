import {describe, it, expect} from "vitest";
import {buildMap, buildWorld, buildZone, pendingLinks, seedFor, validateSpec, worldUnitType} from "../zoneBuild";

const forest = {
  name: "Forest", elvl: 0, start: true, unitTypes: ["wolf"],
  maps: {
    camp: {elvl: 0, theme: "glade", size: [40, 30], tags: ["paths"], entry: true, exits: {north: "woods"}},
    woods: {elvl: 1, theme: "glade", size: [40, 30], exits: {south: "camp", east: {zone: "mire", map: "edge", at: 0.4}}},
  },
};
const mire = {
  name: "Mire", elvl: 2,
  maps: {edge: {theme: "glade", size: [40, 30], tags: ["wet"], exits: {west: {zone: "forest", map: "woods"}}}},
};

describe("validateSpec", () => {
  it("passes a good spec", () => {
    expect(validateSpec(forest, "forest")).toEqual([]);
    expect(validateSpec(mire, "mire")).toEqual([]);
  });

  it("says what's wrong", () => {
    const bad = {
      elvl: -1, colour: "red",
      maps: {
        Camp: {},
        woods: {theme: "jungle", size: [4, 30], exits: {up: "camp", north: "nowhere", south: "lake", west: {zone: "mire", map: "edge", at: 2}}},
        lake: {theme: "glade", size: [40, 30]},
      },
    };
    expect(validateSpec(bad, "forest")).toEqual([
      "unknown fields: colour (known: name, description, elvl, private, start, unitTypes, maps, annotations)",
      "name is required",
      "elvl must be a whole number, 0 or more",
      "maps.Camp: map identifiers are lowercase words with - between them",
      expect.stringMatching(/^maps\.woods\.theme must be one of: /),
      "maps.woods.size must be [cols, rows], each 8 to 200",
      "maps.woods.exits: up isn't a side (north, east, south, west)",
      "maps.woods.exits.north: no map nowhere in this zone",
      "maps.woods.exits.south: lake has no exit back to woods",
      "maps.woods.exits.west.at must be 0 to 1",
    ]);
    expect(validateSpec({...forest, maps: {camp: {...forest.maps.camp, entry: false, exits: {}}}}, "forest")).toEqual(["a start zone needs a map with entry: true"]);
  });
});

describe("buildMap", () => {
  it("generates the map with its exits, walls and an arrival point", () => {
    const map = buildMap("camp", forest.maps.camp, forest);
    expect(map).toMatchObject({identifier: "camp", name: "Camp", feetDimensions: expect.any(Object)});
    expect(map).not.toHaveProperty("elvl");
    expect(map.cellMap.seed).toBe(seedFor("camp"));
    expect(map.cellMap.exits.map((e) => e.side)).toEqual(["north"]);
    expect(map.connections.map((c) => c.identifier)).toEqual(["north", "arrival"]);
    expect(map.barriers.length).toBeGreaterThan(0);
    expect(buildMap("camp", forest.maps.camp, forest)).toEqual(map);
    expect(buildMap("woods", forest.maps.woods, forest)).toMatchObject({elvl: 1, name: "Woods"});
  });
});

describe("buildZone", () => {
  it("links its maps, opens its exits to other zones, and keeps what else the zone has", () => {
    const zone = buildZone(forest, "forest", {respawn: {enabled: true}, unitTypes: {bear: {$ref: "../../unit_types/bear.json", referenceTo: "unit_type"}}});
    expect(zone).toMatchObject({
      name: "Forest", elvl: 0, private: false, respawn: {enabled: true},
      maps: [{$ref: "./camp/camp.json", referenceTo: "map"}, {$ref: "./woods/woods.json", referenceTo: "map"}],
      zoneLinks: [{connectionA: {map: "camp", connection: "north"}, connectionB: {map: "woods", connection: "south"}, oneWay: false, requiredKey: null}],
      entryPoints: {"camp/arrival": null},
      openConnections: {"woods/east": "woods-east"},
    });
    expect(Object.keys(zone.unitTypes)).toEqual(["bear", "wolf"]);
  });
});

describe("buildWorld", () => {
  it("adds the zone, its entry points, and links to other zones once both have the exit", () => {
    const first = buildWorld(null, "Test", "forest", forest, {forest});
    expect(first).toEqual({
      name: "Test",
      zones: {forest: {path: "./zones/forest/forest.json", name: "Forest"}},
      worldLinks: [],
      entryPoints: {"forest/camp/arrival": null},
    });
    expect(pendingLinks("forest", forest, {forest})).toEqual([{map: "woods", side: "east", zone: "mire", target: "edge"}]);

    const both = buildWorld(first, "Test", "mire", mire, {forest, mire});
    expect(Object.keys(both.zones)).toEqual(["forest", "mire"]);
    const link = {zoneA: {zone: "mire", kind: "open", connection: "edge-west"}, zoneB: {zone: "forest", kind: "open", connection: "woods-east"}, oneWay: false, requiredKey: null};
    expect(both.worldLinks).toEqual([link]);
    // Built again, from either side: no second link.
    expect(buildWorld(both, "Test", "forest", forest, {forest, mire}).worldLinks).toEqual([link]);
    expect(pendingLinks("forest", forest, {forest, mire})).toEqual([]);
  });
});

describe("worldUnitType", () => {
  it("points its tokens at the world's copies", () => {
    const {data, tokens} = worldUnitType({name: "Wolf", tokenImageUrl: ["../../tokens/unit/wolves/wolf-1.webp", ":stock:"]}, "unit_types/wolves/wolf.json");
    expect(data.tokenImageUrl).toEqual(["../tokens/unit/wolves/wolf-1.webp", ":stock:"]);
    expect(tokens).toEqual([["tokens/unit/wolves/wolf-1.webp", "tokens/unit/wolves/wolf-1.webp"]]);
    expect(worldUnitType({tokenImageUrl: "../tokens/unit/panther.webp"}, "unit_types/panther.json").data.tokenImageUrl).toBe("../tokens/unit/panther.webp");
  });
});
