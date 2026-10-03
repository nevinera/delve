import {describe, it, expect} from "vitest";
import {fixtureDraft} from "./fixtureWorld";
import {worldData} from "../worldOps";
import {addMap, mapDetails, mapKeysInZone, removeMap, resolveZone, setZoneField, setZonePositions, zoneData, zonePositions} from "../zoneOps";

const FOREST = "worlds/w/zones/forest/forest.json";

describe("zoneOps", () => {
  it("edits a zone field and keeps the world's cached name in step", () => {
    const draft = setZoneField(fixtureDraft(), "forest", "name", "Old Forest");

    expect(zoneData(draft, "forest").name).toEqual("Old Forest");
    expect(worldData(draft).zones.forest.name).toEqual("Old Forest");
    expect(draft.dirtyPaths()).toEqual(["worlds/w/w.json", FOREST]);
  });

  it("lists every map directory in the zone, referenced or not", () => {
    expect(mapKeysInZone(fixtureDraft(), "forest")).toEqual(["hub", "passage"]);
  });

  it("reads referenced maps' details straight from the draft", () => {
    expect(mapDetails(fixtureDraft(), "forest")).toEqual({
      hub: {
        identifier: "hub", name: "Hub", thumbnailUrl: "hub.thumb.webp",
        connections: [{identifier: "central"}, {identifier: "north"}],
        units: [{unitType: "goblin", itemKeys: []}, {unitType: "archer", itemKeys: ["iron-ring"]}],
      },
    });
  });

  it("adds a map and fills in the zone's refs to the world's unit types and items", () => {
    const draft = addMap(setZoneField(fixtureDraft(), "forest", "maps", []), "forest", "hub");
    const zone = zoneData(draft, "forest");

    expect(zone.maps).toEqual([{$ref: "./hub/hub.json", referenceTo: "map"}]);
    expect(zone.unitTypes.archer).toEqual({$ref: "../../unit_types/archer.json", referenceTo: "unit_type"});
    expect(zone.items["iron-ring"]).toEqual({$ref: "../../items/iron-ring.json", referenceTo: "item"});
  });

  it("removes a map along with the entry points and open connections on it", () => {
    const zone = zoneData(removeMap(fixtureDraft(), "forest", 0), "forest");

    expect(zone.maps).toEqual([]);
    expect(zone.entryPoints).toEqual({});
    expect(zone.openConnections).toEqual({});
  });

  it("stores graph positions in the zone's layout file", () => {
    const draft = setZonePositions(fixtureDraft(), "forest", {hub: {x: 9, y: 9}});

    expect(zonePositions(draft, "forest")).toEqual({hub: {x: 9, y: 9}});
  });

  describe("resolveZone", () => {
    it("inlines maps and unit types, rebasing asset URLs to the zone's directory", () => {
      const full = resolveZone(fixtureDraft(), "forest");

      expect(full.maps[0]).toMatchObject({identifier: "hub", imageUrl: "hub/hub.png", thumbnailUrl: "hub/hub.thumb.webp"});
      expect(full.unitTypes.goblin).toEqual({name: "Goblin", tokenImageUrl: ["../../tokens/goblin.webp"]});
    });

    it("sees unsaved edits", () => {
      const draft = fixtureDraft().write("worlds/w/unit_types/goblin.json", {name: "Hobgoblin"});

      expect(resolveZone(draft, "forest").unitTypes.goblin.name).toEqual("Hobgoblin");
    });

    it("names a $ref that doesn't resolve", () => {
      const draft = setZoneField(fixtureDraft(), "forest", "unitTypes", {ghost: {$ref: "../../unit_types/ghost.json", referenceTo: "unit_type"}});

      expect(() => resolveZone(draft, "forest")).toThrow(/ghost.json doesn't resolve/);
    });
  });
});
