import {describe, it, expect} from "vitest";
import {zoneReducer} from "../zoneReducer";

function zoneState(overrides = {}) {
  return {
    name: "Goblin Cave",
    maps: [{$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"}],
    zoneLinks: [{connectionA: {map: "cave_entrance", connection: "cave_mouth"}, connectionB: {map: "cave_interior", connection: "entrance"}}],
    entryPoints: {"cave_entrance/clearing_entrance": null},
    openConnections: {"cave_entrance/back_door": "back_way"},
    ...overrides,
  };
}

describe("zoneReducer", () => {
  it("falls through to the generic ability-style reducer for SET_FIELD", () => {
    const result = zoneReducer(zoneState(), {type: "SET_FIELD", field: "name", value: "Goblin Warren"});
    expect(result.name).toBe("Goblin Warren");
  });

  it("removes the map at the given index on REMOVE_MAP", () => {
    const result = zoneReducer(zoneState(), {type: "REMOVE_MAP", index: 0, mapIdentifier: "cave_entrance"});
    expect(result.maps).toEqual([]);
  });

  it("strips zoneLinks referencing the removed map's identifier on either end", () => {
    const state = zoneState({
      zoneLinks: [
        {connectionA: {map: "cave_entrance", connection: "a"}, connectionB: {map: "cave_interior", connection: "b"}},
        {connectionA: {map: "cave_interior", connection: "c"}, connectionB: {map: "cave_entrance", connection: "d"}},
        {connectionA: {map: "cave_interior", connection: "e"}, connectionB: {map: "boss_room", connection: "f"}},
      ],
    });

    const result = zoneReducer(state, {type: "REMOVE_MAP", index: 0, mapIdentifier: "cave_entrance"});

    expect(result.zoneLinks).toEqual([
      {connectionA: {map: "cave_interior", connection: "e"}, connectionB: {map: "boss_room", connection: "f"}},
    ]);
  });

  it("strips entryPoints and openConnections keyed under the removed map's identifier", () => {
    const state = zoneState({
      entryPoints: {"cave_entrance/clearing": null, "cave_interior/pit": "iron_key"},
      openConnections: {"cave_entrance/back_door": "back_way", "cave_interior/vent": "upper_vent"},
    });

    const result = zoneReducer(state, {type: "REMOVE_MAP", index: 0, mapIdentifier: "cave_entrance"});

    expect(result.entryPoints).toEqual({"cave_interior/pit": "iron_key"});
    expect(result.openConnections).toEqual({"cave_interior/vent": "upper_vent"});
  });

  it("only removes the map itself, leaving links/entries alone, when no mapIdentifier is resolved yet", () => {
    const state = zoneState();

    const result = zoneReducer(state, {type: "REMOVE_MAP", index: 0, mapIdentifier: undefined});

    expect(result.maps).toEqual([]);
    expect(result.zoneLinks).toEqual(state.zoneLinks);
    expect(result.entryPoints).toEqual(state.entryPoints);
    expect(result.openConnections).toEqual(state.openConnections);
  });
});
