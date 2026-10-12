import {describe, it, expect} from "vitest";
import {outlineMap, outlineText, outlineZone} from "../outline";
import {generateCellMap} from "../../cellMap/generate";
import {autoBarriers} from "../../mapEditor/cells/autoBarriers";
import {mapSize} from "../../cellMap/hexGrid";

const rect = (x0, y0, x1, y1) => [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}];

// A walled room from (10, 10) to (90, 40), the rest of the map filled, its
// west and east halves two places. A wall splits them, with a gap unless
// shut.
function room({shut = false} = {}) {
  const ring = {type: "wall", locations: [...rect(10, 10, 90, 40), {x: 10, y: 10}]};
  const split = shut ? {type: "wall", locations: [{x: 50, y: 10}, {x: 50, y: 40}]} : {type: "wall", locations: [{x: 50, y: 10}, {x: 50, y: 30}]};
  return {
    identifier: "room", name: "The Room", feetDimensions: {width: 100, height: 50},
    barriers: [ring, split],
    connections: [{identifier: "door", type: "point", position: {x: 85, y: 25, angle: 0}, fuzzRadius: 0, fuzzAngle: 0}],
    units: [{unitType: "goblin", position: {x: 20, y: 20, angle: 0}}, {unitType: "goblin", position: {x: 30, y: 30, angle: 0}}, {unitType: "rat", position: {x: 70, y: 20, angle: 0}}],
    places: [
      {identifier: "west", name: "West End", tags: ["camp"], annotations: {population: "two goblins"}, polygon: rect(0, 0, 50, 50)},
      {identifier: "east", polygon: rect(50, 0, 100, 50)},
    ],
  };
}

describe("outlineMap", () => {
  it("gives each place its open ground's area, the units in it, and its neighbors", () => {
    const outline = outlineMap(room());
    expect(outline).toMatchObject({identifier: "room", name: "The Room", size: {width: 100, height: 50}, units: {goblin: 2, rat: 1}});
    const [west, east] = outline.places;
    expect(west).toMatchObject({identifier: "west", name: "West End", tags: ["camp"], annotations: {population: "two goblins"}, adjacent: ["east"], units: {goblin: 2}});
    expect(east).toMatchObject({identifier: "east", adjacent: ["west"], units: {rat: 1}});
    expect(west.area).toBeGreaterThan(1100);
    expect(west.area).toBeLessThan(1300);
    expect(outline.connections).toEqual([{identifier: "door", type: "point", place: "east"}]);
    expect(outline).not.toHaveProperty("unplacedArea");
  });

  it("doesn't make places next to each other through a wall", () => {
    const [west, east] = outlineMap(room({shut: true})).places;
    expect(west.adjacent).toEqual([]);
    expect(east.adjacent).toEqual([]);
  });

  it("puts a point in the smallest place around it", () => {
    const map = room();
    map.places.push({identifier: "tent", polygon: rect(15, 15, 25, 25)});
    const [west, , tent] = outlineMap(map).places;
    expect(tent).toMatchObject({adjacent: ["west"], units: {goblin: 1}});
    expect(west.units).toEqual({goblin: 1});
    expect(west.adjacent).toEqual(["east", "tent"]);
  });

  it("says how much open ground is in no place, beyond slivers", () => {
    const map = room();
    map.places = map.places.slice(0, 1);
    expect(outlineMap(map).unplacedArea).toBeGreaterThan(1000);
  });

  it("partitions a generated map into neighboring places", () => {
    const cellMap = generateCellMap({cols: 40, rows: 30, seed: 7, connections: 2});
    const walls = autoBarriers(cellMap);
    const {width, height} = mapSize(cellMap.grid);
    const outline = outlineMap({identifier: "gen", feetDimensions: {width, height}, barriers: walls.barriers, fillPoints: walls.fillPoints, connections: walls.connections, places: walls.places, cellMap});
    expect(outline.places.length).toBe(cellMap.places.length);
    expect(outline.places.every((p) => p.area > 0 && p.adjacent.length > 0)).toBe(true);
    expect(outline.connections.every((c) => c.place)).toBe(true);
    expect(outline).not.toHaveProperty("unplacedArea");
  });

  it("says where each place is, its terrains and whether a trail runs through it", () => {
    const cellMap = generateCellMap({cols: 40, rows: 30, seed: 7, connections: 2, tags: ["paths"]});
    const walls = autoBarriers(cellMap);
    const {width, height} = mapSize(cellMap.grid);
    const {places} = outlineMap({identifier: "gen", feetDimensions: {width, height}, barriers: walls.barriers, fillPoints: walls.fillPoints, connections: walls.connections, places: walls.places, cellMap});
    expect(places.every((p) => /^(north|south)?-?(west|east)?$|^middle$/.test(p.at))).toBe(true);
    expect(places.every((p) => /^[a-z ]+ \d+%(, [a-z ]+ \d+%)*$/.test(p.terrain))).toBe(true);
    expect(places.some((p) => p.trail)).toBe(true);
    expect(places.some((p) => !p.trail)).toBe(true);
    // The room's east place: middle of the map's east third, no cellMap.
    const [, east] = outlineMap(room()).places;
    expect(east).toMatchObject({at: "east"});
    expect(east).not.toHaveProperty("terrain");
  });
});

describe("outlineZone", () => {
  it("links maps by the places their connections open into, as JSON or text", () => {
    const other = {...room(), identifier: "hall", name: undefined, units: [], places: []};
    const zone = {
      name: "Test", elvl: 1, private: true, unitTypes: {goblin: {name: "Goblin", maxHP: 200}},
      maps: [room(), other],
      zoneLinks: [{connectionA: {map: "room", connection: "door"}, connectionB: {map: "hall", connection: "door"}, oneWay: false, requiredKey: null}],
      entryPoints: {"room/door": null},
    };
    const outline = outlineZone(zone);
    expect(outline.links).toEqual([{a: {map: "room", connection: "door", place: "east"}, b: {map: "hall", connection: "door"}}]);
    expect(outline.unitTypes).toEqual({goblin: {name: "Goblin", maxHP: 200}});
    expect(outline.entryPoints).toEqual(["room/door"]);
    const text = outlineText(outline);
    expect(text).toContain('Map room "The Room", 100x50 ft');
    expect(text).toContain('  west "West End" [camp]');
    expect(text).toContain("    population: two goblins");
    expect(text).toContain("    connections: door");
    expect(text).toContain("  room/door (east) <-> hall/door");
    expect(text).toContain("Map hall, 100x50 ft\n  (no places)");
  });

  it("carries the zone's, unit types', maps', units' and NCUs' annotations, units and NCUs by place", () => {
    const map = {...room(), annotations: {plan: "The first room."}};
    map.units[0] = {...map.units[0], identifier: "boss", annotations: {backstory: "Grew up here.\nNever left."}};
    map.ncus = [{identifier: "sesh", name: "Sesh", position: {x: 70, y: 30, angle: 0}, annotations: {personality: "wary"}}, {identifier: "quiet", position: {x: 75, y: 30, angle: 0}}];
    const zone = {name: "Test", annotations: {plan: "A test zone."}, unitTypes: {goblin: {name: "Goblin", annotations: {variants: "the Old Goblin"}}}, maps: [map]};
    const outline = outlineZone(zone);
    expect(outline.zone.annotations).toEqual({plan: "A test zone."});
    expect(outline.unitTypes.goblin.annotations).toEqual({variants: "the Old Goblin"});
    expect(outline.maps[0].annotations).toEqual({plan: "The first room."});
    expect(outline.maps[0].annotated).toEqual([
      {kind: "unit", identifier: "boss", unitType: "goblin", annotations: {backstory: "Grew up here.\nNever left."}, place: "west"},
      {kind: "ncu", identifier: "sesh", name: "Sesh", annotations: {personality: "wary"}, place: "east"},
    ]);
    const text = outlineText(outline);
    expect(text).toContain("Zone: Test\n  plan: A test zone.");
    expect(text).toContain("  goblin:\n    variants: the Old Goblin");
    expect(text).toContain('Map room "The Room", 100x50 ft\n  plan: The first room.');
    expect(text).toContain("    unit boss (goblin):\n      backstory: Grew up here.\n        Never left.");
    expect(text).toContain('    ncu sesh "Sesh":\n      personality: wary');
  });

  it("leaves out annotations nothing has", () => {
    const outline = outlineZone({name: "Bare", maps: [room()]});
    expect(outline.zone).not.toHaveProperty("annotations");
    expect(outline.maps[0]).not.toHaveProperty("annotations");
    expect(outline.maps[0]).not.toHaveProperty("annotated");
  });
});
