import {describe, it, expect} from "vitest";
import {fixtureDraft} from "./fixtureWorld";
import {zoneData} from "../zoneOps";
import {mapData} from "../mapOps";
import {createUnitType, deleteUnitType, renameUnitType, unitTypeData, unitTypeKeys, unitTypeUses, updateUnitType} from "../unitTypeOps";

describe("unitTypeOps", () => {
  it("lists the world's unit types, each with its token list as an array", () => {
    const draft = fixtureDraft();
    expect(unitTypeKeys(draft)).toEqual(["goblin"]);
    expect(unitTypeData(draft, "goblin").tokenImageUrl).toEqual(["../tokens/goblin.webp"]);
    expect(unitTypeData(updateUnitType(draft, "goblin", {name: "G", tokenImageUrl: "x.webp"}), "goblin").tokenImageUrl).toEqual(["x.webp"]);
  });

  it("creates a blank unit type, refusing a taken or malformed key", () => {
    const draft = createUnitType(fixtureDraft(), "troll", "Big Troll");

    expect(unitTypeKeys(draft)).toEqual(["goblin", "troll"]);
    expect(unitTypeData(draft, "troll")).toMatchObject({name: "Big Troll", powers: []});
    expect(() => createUnitType(draft, "troll")).toThrow(/already exists/);
    expect(() => createUnitType(draft, "a/b")).toThrow(/valid identifier/);
  });

  it("finds where a unit type is placed", () => {
    expect(unitTypeUses(fixtureDraft(), "goblin")).toEqual([{zone: "forest", map: "hub", count: 1}]);
    expect(unitTypeUses(fixtureDraft(), "troll")).toEqual([]);
  });

  it("renames a unit type, rewriting map units and zone entries", () => {
    const draft = renameUnitType(fixtureDraft(), "goblin", "goblin-raider");

    expect(unitTypeKeys(draft)).toEqual(["goblin-raider"]);
    expect(mapData(draft, "forest", "hub").units.map((unit) => unit.unitType)).toEqual(["goblin-raider", "archer"]);
    expect(zoneData(draft, "forest").unitTypes).toEqual({"goblin-raider": {$ref: "../../unit_types/goblin-raider.json", referenceTo: "unit_type"}});
    expect(() => renameUnitType(draft, "goblin-raider", "a b")).toThrow(/valid identifier/);
  });

  it("refuses to delete a placed unit type, saying where", () => {
    expect(() => deleteUnitType(fixtureDraft(), "goblin")).toThrow('"goblin" is still placed on forest/hub (1)');
  });

  it("deletes an unplaced unit type and its zone entries", () => {
    const unplaced = fixtureDraft().write("worlds/w/zones/forest/hub/hub.json", {...mapData(fixtureDraft(), "forest", "hub"), units: []});
    const draft = deleteUnitType(unplaced, "goblin");

    expect(unitTypeKeys(draft)).toEqual([]);
    expect(zoneData(draft, "forest").unitTypes).toEqual({});
  });
});
