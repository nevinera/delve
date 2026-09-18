import {describe, it, expect} from "vitest";
import {WorldDraft} from "../WorldDraft";

function worldData(overrides = {}) {
  return {
    name: "Northern Barrens",
    zones: {
      goblin_cave: {path: "./zones/goblin-cave.json", name: "Goblin Cave", description: "A damp cave."},
      stagnant_oasis: {path: "./zones/stagnant-oasis.json", name: "Stagnant Oasis"},
    },
    worldLinks: [{
      zoneA: {zone: "goblin_cave", connection: "cliff_above"},
      zoneB: {zone: "stagnant_oasis", connection: "goblin_trailhead"},
      oneWay: false,
      requiredKey: null,
    }],
    entryPoints: {stagnant_oasis: null},
    ...overrides,
  };
}

describe("WorldDraft", () => {
  it("setField sets a top-level field", () => {
    const draft = new WorldDraft(worldData());
    const result = draft.setField("name", "Southern Barrens");
    expect(result.data.name).toBe("Southern Barrens");
  });

  it("addEntry appends to a section", () => {
    const draft = new WorldDraft(worldData({worldLinks: []}));
    const link = {zoneA: {zone: "a", connection: "x"}, zoneB: {zone: "b", connection: "y"}, oneWay: false, requiredKey: null};
    const result = draft.addEntry("worldLinks", link);
    expect(result.data.worldLinks).toEqual([link]);
  });

  it("removeEntry removes by index", () => {
    const draft = new WorldDraft(worldData({worldLinks: [{zoneA: {zone: "a"}}, {zoneA: {zone: "b"}}]}));
    const result = draft.removeEntry("worldLinks", 0);
    expect(result.data.worldLinks).toEqual([{zoneA: {zone: "b"}}]);
  });

  it("updateEntryField merges one field onto the entry at index", () => {
    const draft = new WorldDraft(worldData({worldLinks: [{oneWay: false, requiredKey: null}]}));
    const result = draft.updateEntryField("worldLinks", 0, "oneWay", true);
    expect(result.data.worldLinks).toEqual([{oneWay: true, requiredKey: null}]);
  });

  it("updateEntryFields merges several fields at once", () => {
    const draft = new WorldDraft(worldData({worldLinks: [{oneWay: false, requiredKey: null}]}));
    const result = draft.updateEntryFields("worldLinks", 0, {oneWay: true, requiredKey: "iron_key"});
    expect(result.data.worldLinks).toEqual([{oneWay: true, requiredKey: "iron_key"}]);
  });

  it("setZone adds a new zone entry", () => {
    const draft = new WorldDraft(worldData({zones: {}}));
    const result = draft.setZone("goblin_cave", {path: "./zones/goblin-cave.json"});
    expect(result.data.zones).toEqual({goblin_cave: {path: "./zones/goblin-cave.json"}});
  });

  describe("syncZoneDetails", () => {
    it("merges a fetched zone's name/description into its cached entry, without touching path", () => {
      const draft = new WorldDraft(worldData());
      const result = draft.syncZoneDetails({goblin_cave: {name: "The Goblin Cave", description: "Updated.", openConnections: {}}});
      expect(result.data.zones.goblin_cave).toEqual({path: "./zones/goblin-cave.json", name: "The Goblin Cave", description: "Updated."});
      expect(result.data.zones.stagnant_oasis).toEqual(worldData().zones.stagnant_oasis);
    });

    it("defaults description to null when the fetched zone doesn't have one", () => {
      const draft = new WorldDraft(worldData());
      const result = draft.syncZoneDetails({stagnant_oasis: {name: "Stagnant Oasis"}});
      expect(result.data.zones.stagnant_oasis).toEqual({path: "./zones/stagnant-oasis.json", name: "Stagnant Oasis", description: null});
    });

    it("ignores a key that isn't already in zones", () => {
      const draft = new WorldDraft(worldData());
      const result = draft.syncZoneDetails({boss_room: {name: "Boss Room"}});
      expect(result.data.zones).toEqual(worldData().zones);
    });
  });

  describe("removeZone", () => {
    it("removes the zone entry itself", () => {
      const result = new WorldDraft(worldData()).removeZone("goblin_cave");
      expect(result.data.zones).toEqual({stagnant_oasis: worldData().zones.stagnant_oasis});
    });

    it("strips worldLinks referencing the removed zone on either end", () => {
      const draft = new WorldDraft(worldData({
        worldLinks: [
          {zoneA: {zone: "goblin_cave", connection: "a"}, zoneB: {zone: "stagnant_oasis", connection: "b"}},
          {zoneA: {zone: "stagnant_oasis", connection: "c"}, zoneB: {zone: "goblin_cave", connection: "d"}},
          {zoneA: {zone: "stagnant_oasis", connection: "e"}, zoneB: {zone: "boss_room", connection: "f"}},
        ],
      }));

      const result = draft.removeZone("goblin_cave");

      expect(result.data.worldLinks).toEqual([
        {zoneA: {zone: "stagnant_oasis", connection: "e"}, zoneB: {zone: "boss_room", connection: "f"}},
      ]);
    });

    it("strips entryPoints keyed under the removed zone", () => {
      const draft = new WorldDraft(worldData({entryPoints: {goblin_cave: null, stagnant_oasis: "iron_key"}}));
      const result = draft.removeZone("goblin_cave");
      expect(result.data.entryPoints).toEqual({stagnant_oasis: "iron_key"});
    });
  });

  it("setEntryPoint sets an entry point, including a null required key, without touching other entries", () => {
    const draft = new WorldDraft(worldData({entryPoints: {stagnant_oasis: "iron_key"}}));
    const result = draft.setEntryPoint("goblin_cave", null);
    expect(result.data.entryPoints).toEqual({stagnant_oasis: "iron_key", goblin_cave: null});
  });

  it("removeEntryPoint removes an entry point by key", () => {
    const draft = new WorldDraft(worldData({entryPoints: {goblin_cave: null, stagnant_oasis: "iron_key"}}));
    const result = draft.removeEntryPoint("goblin_cave");
    expect(result.data.entryPoints).toEqual({stagnant_oasis: "iron_key"});
  });

  describe("updateWorldLinkSide", () => {
    it("merges one field onto the given side without touching the other", () => {
      const draft = new WorldDraft(worldData({
        worldLinks: [{zoneA: {zone: "goblin_cave", kind: "open", connection: "cliff_above"}, zoneB: {zone: "stagnant_oasis", kind: "open", connection: "goblin_trailhead"}}],
      }));

      const result = draft.updateWorldLinkSide(0, "zoneA", "connection", "back_door");

      expect(result.data.worldLinks[0].zoneA).toEqual({zone: "goblin_cave", kind: "open", connection: "back_door"});
      expect(result.data.worldLinks[0].zoneB).toEqual({zone: "stagnant_oasis", kind: "open", connection: "goblin_trailhead"});
    });

    it("clears the picked connection when the zone changes", () => {
      const draft = new WorldDraft(worldData({
        worldLinks: [{zoneA: {zone: "goblin_cave", kind: "open", connection: "cliff_above"}, zoneB: {zone: "", kind: "open", connection: ""}}],
      }));

      const result = draft.updateWorldLinkSide(0, "zoneA", "zone", "stagnant_oasis");

      expect(result.data.worldLinks[0].zoneA).toEqual({zone: "stagnant_oasis", kind: "open", connection: ""});
    });

    it("clears the picked connection when the kind changes", () => {
      const draft = new WorldDraft(worldData({
        worldLinks: [{zoneA: {zone: "goblin_cave", kind: "open", connection: "cliff_above"}, zoneB: {zone: "", kind: "open", connection: ""}}],
      }));

      const result = draft.updateWorldLinkSide(0, "zoneA", "kind", "entryPoint");

      expect(result.data.worldLinks[0].zoneA).toEqual({zone: "goblin_cave", kind: "entryPoint", connection: ""});
    });
  });

  it("removeWorldLink removes the worldLink at the given index", () => {
    const draft = new WorldDraft(worldData({
      worldLinks: [
        {zoneA: {zone: "a", connection: "x"}, zoneB: {zone: "b", connection: "y"}},
        {zoneA: {zone: "c", connection: "z"}, zoneB: {zone: "d", connection: "w"}},
      ],
    }));
    const result = draft.removeWorldLink(0);
    expect(result.data.worldLinks).toEqual([{zoneA: {zone: "c", connection: "z"}, zoneB: {zone: "d", connection: "w"}}]);
  });

  it("addWorldLink adds a new worldLink, assumed two-way and keyless, without touching existing links", () => {
    const draft = new WorldDraft(worldData({worldLinks: [{zoneA: {zone: "a", connection: "x"}, zoneB: {zone: "b", connection: "y"}}]}));

    const result = draft.addWorldLink(
      {zone: "goblin_cave", connection: "cliff_above"},
      {zone: "stagnant_oasis", connection: "goblin_trailhead"}
    );

    expect(result.data.worldLinks).toEqual([
      {zoneA: {zone: "a", connection: "x"}, zoneB: {zone: "b", connection: "y"}},
      {zoneA: {zone: "goblin_cave", connection: "cliff_above"}, zoneB: {zone: "stagnant_oasis", connection: "goblin_trailhead"}, oneWay: false, requiredKey: null},
    ]);
  });
});
