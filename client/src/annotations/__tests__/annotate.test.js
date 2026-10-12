import {describe, it, expect} from "vitest";
import {annotationsOf, findTarget, formatLike, removeAnnotation, setAnnotation, setPlaceName} from "../annotate";
import {normalize} from "../paths";

// A world, its quests and one zone, its map in a file of its own, its unit
// type in a shared library.
function files() {
  return {
    "/c/worlds/w/w.json": {name: "W", zones: {cave: {path: "./zones/cave/cave.json", name: "Cave"}}, entryPoints: {"cave/hall/in": null}, questsPath: "./quests.json"},
    "/c/worlds/w/quests.json": [{identifier: "kill-grutt", name: "Kill Grutt"}],
    "/c/worlds/w/zones/cave/cave.json": {
      name: "Cave", elvl: 5, private: false,
      maps: [{$ref: "./hall/hall.json", referenceTo: "map"}, {identifier: "pit", name: "Pit", annotations: {plan: "A pit."}}],
      unitTypes: {goblin: {$ref: "../../../../unit_types/goblin.json", referenceTo: "unit_type"}, rat: {name: "Rat"}},
    },
    "/c/worlds/w/zones/cave/hall/hall.json": {
      identifier: "hall", name: "Hall",
      places: [{identifier: "throne", polygon: []}],
      units: [{identifier: "grutt", unitType: "goblin"}],
      ncus: [{identifier: "maren", name: "Maren"}],
      interactables: [{identifier: "cage-1", name: "Cage"}],
    },
    "/c/unit_types/goblin.json": {name: "Goblin"},
  };
}

function reader(store) {
  return (path) => {
    if (!(path in store)) throw new Error(`no file ${path}`);
    return store[path];
  };
}

const find = (store, path, target) => findTarget(reader(store), path, target);

describe("findTarget", () => {
  const zone = "/c/worlds/w/zones/cave/cave.json";
  const world = "/c/worlds/w/w.json";

  it("finds zone targets, following $refs to the file that holds them", () => {
    const store = files();
    expect(find(store, zone, "zone")).toMatchObject({file: zone, object: store[zone], label: "the zone"});
    expect(find(store, zone, "pit")).toMatchObject({file: zone, object: {identifier: "pit"}, label: "map pit"});
    const hall = "/c/worlds/w/zones/cave/hall/hall.json";
    expect(find(store, zone, "hall")).toMatchObject({file: hall, object: store[hall]});
    expect(find(store, zone, "hall/throne")).toMatchObject({file: hall, object: {identifier: "throne"}, label: "place throne on map hall"});
    expect(find(store, zone, "hall/unit:grutt")).toMatchObject({file: hall, object: {identifier: "grutt"}, label: "unit grutt on map hall"});
    expect(find(store, zone, "hall/ncu:maren")).toMatchObject({file: hall, object: {name: "Maren"}});
    expect(find(store, zone, "hall/interactable:cage-1")).toMatchObject({file: hall, object: {name: "Cage"}, label: "interactable cage-1 on map hall"});
    expect(() => find(store, zone, "hall/interactable:cage-2")).toThrow('map hall has no interactable "cage-2"');
    expect(find(store, zone, "unit-type:goblin")).toMatchObject({file: "/c/unit_types/goblin.json", object: {name: "Goblin"}});
    expect(find(store, zone, "unit-type:rat")).toMatchObject({file: zone, object: {name: "Rat"}});
  });

  it("finds world targets: the world, its quests and its zones' targets", () => {
    const store = files();
    expect(find(store, world, "world")).toMatchObject({file: world, object: store[world]});
    expect(find(store, world, "quest:kill-grutt")).toMatchObject({file: "/c/worlds/w/quests.json", object: {name: "Kill Grutt"}, label: "quest kill-grutt"});
    expect(find(store, world, "zone:cave")).toMatchObject({file: zone, label: "the zone"});
    expect(find(store, world, "zone:cave/hall/unit:grutt")).toMatchObject({object: {identifier: "grutt"}});
  });

  it("says what's missing", () => {
    const store = files();
    expect(() => find(store, zone, "nowhere")).toThrow(/no map "nowhere" \(maps: hall, pit\)/);
    expect(() => find(store, zone, "hall/den")).toThrow(/map hall has no place "den" \(places: throne\)/);
    expect(() => find(store, zone, "hall/unit:krugg")).toThrow(/map hall has no unit "krugg"/);
    expect(() => find(store, zone, "unit-type:bear")).toThrow(/no unit type "bear" \(unit types: goblin, rat\)/);
    expect(() => find(store, zone, "hall/throne/seat")).toThrow(/isn't a zone target/);
    expect(() => find(store, world, "quest:none")).toThrow(/has no quest "none"/);
    delete store[world].questsPath;
    expect(find(store, world, "quest:kill-grutt")).toMatchObject({file: "/c/worlds/w/quests.json"});
    expect(() => find(store, world, "zone:swamp")).toThrow(/no zone "swamp" \(zones: cave\)/);
    expect(() => find(store, world, "hall")).toThrow(/isn't a world target/);
    expect(() => find(store, "/c/unit_types/goblin.json", "zone")).toThrow(/neither a world .* nor a zone/);
  });
});

describe("setAnnotation and removeAnnotation", () => {
  it("adds, replaces and removes, dropping the field with the last one", () => {
    const place = {identifier: "throne"};
    setAnnotation(place, "plan", "Grutt's seat.");
    setAnnotation(place, "population", "dense");
    setAnnotation(place, "plan", "The King's seat.");
    expect(annotationsOf(place)).toEqual({plan: "The King's seat.", population: "dense"});
    expect(removeAnnotation(place, "plan")).toBe(true);
    expect(removeAnnotation(place, "plan")).toBe(false);
    expect(removeAnnotation(place, "population")).toBe(true);
    expect(place).toEqual({identifier: "throne"});
  });

  it("refuses what the validators would", () => {
    const place = {};
    expect(() => setAnnotation(place, "Who?", "x")).toThrow(/keys are lowercase words/);
    expect(() => setAnnotation(place, "plan", "  ")).toThrow(/must not be empty/);
    expect(() => setAnnotation(place, "plan", "x".repeat(4001))).toThrow(/more than the maximum of 4000/);
    for (let i = 0; i < 32; i++) setAnnotation(place, `note${i}`, "x");
    expect(() => setAnnotation(place, "one-more", "x")).toThrow(/already has 32 annotations/);
    expect(() => setAnnotation(place, "note0", "replaced")).not.toThrow();
  });
});

describe("setPlaceName", () => {
  it("names a place, unless another on the map has the name or it's too long", () => {
    const places = [{identifier: "a", name: "The Den"}, {identifier: "b"}];
    setPlaceName(places, places[1], "The Camp");
    expect(places[1].name).toBe("The Camp");
    setPlaceName(places, places[0], "The Den");
    expect(() => setPlaceName(places, places[1], "The Den")).toThrow(/place a is already named "The Den"/);
    expect(() => setPlaceName(places, places[1], " ")).toThrow(/must not be empty/);
    expect(() => setPlaceName(places, places[1], "x".repeat(81))).toThrow(/maximum of 80/);
  });
});

describe("formatLike", () => {
  it("writes 2-space JSON, keeping the original's trailing newline or lack of one", () => {
    expect(formatLike('{"a": 1}\n', {a: 1})).toBe('{\n  "a": 1\n}\n');
    expect(formatLike('{"a": 1}', {a: 1})).toBe('{\n  "a": 1\n}');
  });
});

describe("normalize", () => {
  it("folds . and .. segments", () => {
    expect(normalize("/c/worlds/w/zones/cave/../../../../unit_types/goblin.json")).toBe("/c/unit_types/goblin.json");
    expect(normalize("a/./b/../c")).toBe("a/c");
    expect(normalize("../a")).toBe("../a");
  });
});
