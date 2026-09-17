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

  it("sets an entry point, including a null required key, without touching other entries", () => {
    const state = zoneState({entryPoints: {"cave_interior/pit": "iron_key"}});
    const result = zoneReducer(state, {type: "SET_ENTRY_POINT", key: "cave_entrance/cave_mouth", requiredKey: null});
    expect(result.entryPoints).toEqual({"cave_interior/pit": "iron_key", "cave_entrance/cave_mouth": null});
  });

  it("removes an entry point by key", () => {
    const state = zoneState({entryPoints: {"cave_entrance/clearing": null, "cave_interior/pit": "iron_key"}});
    const result = zoneReducer(state, {type: "REMOVE_ENTRY_POINT", key: "cave_entrance/clearing"});
    expect(result.entryPoints).toEqual({"cave_interior/pit": "iron_key"});
  });

  it("sets an open connection's exposed name", () => {
    const state = zoneState({openConnections: {}});
    const result = zoneReducer(state, {type: "SET_OPEN_CONNECTION", key: "cave_entrance/back_door", name: "back_way"});
    expect(result.openConnections).toEqual({"cave_entrance/back_door": "back_way"});
  });

  it("removes an open connection by key", () => {
    const state = zoneState({openConnections: {"cave_entrance/back_door": "back_way", "cave_interior/vent": "upper_vent"}});
    const result = zoneReducer(state, {type: "REMOVE_OPEN_CONNECTION", key: "cave_entrance/back_door"});
    expect(result.openConnections).toEqual({"cave_interior/vent": "upper_vent"});
  });

  it("updates a single field on the zoneLink at the given index, leaving other links alone", () => {
    const state = zoneState({
      zoneLinks: [
        {connectionA: {map: "a", connection: "x"}, connectionB: {map: "b", connection: "y"}, oneWay: false, requiredKey: null},
        {connectionA: {map: "c", connection: "z"}, connectionB: {map: "d", connection: "w"}, oneWay: false, requiredKey: null},
      ],
    });
    const result = zoneReducer(state, {type: "UPDATE_ZONE_LINK", index: 1, field: "oneWay", value: true});
    expect(result.zoneLinks[0].oneWay).toBe(false);
    expect(result.zoneLinks[1].oneWay).toBe(true);
  });

  it("removes the zoneLink at the given index", () => {
    const state = zoneState({
      zoneLinks: [
        {connectionA: {map: "a", connection: "x"}, connectionB: {map: "b", connection: "y"}},
        {connectionA: {map: "c", connection: "z"}, connectionB: {map: "d", connection: "w"}},
      ],
    });
    const result = zoneReducer(state, {type: "REMOVE_ZONE_LINK", index: 0});
    expect(result.zoneLinks).toEqual([{connectionA: {map: "c", connection: "z"}, connectionB: {map: "d", connection: "w"}}]);
  });
});
