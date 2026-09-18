import {describe, it, expect} from "vitest";
import {ZoneDraft} from "../ZoneDraft";

function zoneData(overrides = {}) {
  return {
    name: "Goblin Cave",
    maps: [{$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"}],
    zoneLinks: [{connectionA: {map: "cave_entrance", connection: "cave_mouth"}, connectionB: {map: "cave_interior", connection: "entrance"}}],
    entryPoints: {"cave_entrance/clearing_entrance": null},
    openConnections: {"cave_entrance/back_door": "back_way"},
    ...overrides,
  };
}

describe("ZoneDraft", () => {
  it("setField sets a top-level field", () => {
    const draft = new ZoneDraft(zoneData());
    const result = draft.setField("name", "Goblin Warren");
    expect(result.data.name).toBe("Goblin Warren");
  });

  it("addEntry appends to a section", () => {
    const draft = new ZoneDraft(zoneData({maps: []}));
    const result = draft.addEntry("maps", {$ref: "./x.json", referenceTo: "map"});
    expect(result.data.maps).toEqual([{$ref: "./x.json", referenceTo: "map"}]);
  });

  it("removeEntry removes by index", () => {
    const draft = new ZoneDraft(zoneData({maps: [{$ref: "a"}, {$ref: "b"}]}));
    const result = draft.removeEntry("maps", 0);
    expect(result.data.maps).toEqual([{$ref: "b"}]);
  });

  it("updateEntryField merges one field onto the entry at index", () => {
    const draft = new ZoneDraft(zoneData({maps: [{$ref: "a", referenceTo: "map"}]}));
    const result = draft.updateEntryField("maps", 0, "referenceTo", "other");
    expect(result.data.maps).toEqual([{$ref: "a", referenceTo: "other"}]);
  });

  it("updateEntryFields merges several fields at once", () => {
    const draft = new ZoneDraft(zoneData({maps: [{$ref: "a", referenceTo: "map"}]}));
    const result = draft.updateEntryFields("maps", 0, {referenceTo: "other", extra: true});
    expect(result.data.maps).toEqual([{$ref: "a", referenceTo: "other", extra: true}]);
  });

  describe("removeMap", () => {
    it("removes the map at the given index", () => {
      const result = new ZoneDraft(zoneData()).removeMap(0, "cave_entrance");
      expect(result.data.maps).toEqual([]);
    });

    it("strips zoneLinks referencing the removed map's identifier on either end", () => {
      const draft = new ZoneDraft(zoneData({
        zoneLinks: [
          {connectionA: {map: "cave_entrance", connection: "a"}, connectionB: {map: "cave_interior", connection: "b"}},
          {connectionA: {map: "cave_interior", connection: "c"}, connectionB: {map: "cave_entrance", connection: "d"}},
          {connectionA: {map: "cave_interior", connection: "e"}, connectionB: {map: "boss_room", connection: "f"}},
        ],
      }));

      const result = draft.removeMap(0, "cave_entrance");

      expect(result.data.zoneLinks).toEqual([
        {connectionA: {map: "cave_interior", connection: "e"}, connectionB: {map: "boss_room", connection: "f"}},
      ]);
    });

    it("strips entryPoints and openConnections keyed under the removed map's identifier", () => {
      const draft = new ZoneDraft(zoneData({
        entryPoints: {"cave_entrance/clearing": null, "cave_interior/pit": "iron_key"},
        openConnections: {"cave_entrance/back_door": "back_way", "cave_interior/vent": "upper_vent"},
      }));

      const result = draft.removeMap(0, "cave_entrance");

      expect(result.data.entryPoints).toEqual({"cave_interior/pit": "iron_key"});
      expect(result.data.openConnections).toEqual({"cave_interior/vent": "upper_vent"});
    });

    it("only removes the map itself, leaving links/entries alone, when no mapIdentifier is resolved yet", () => {
      const data = zoneData();
      const result = new ZoneDraft(data).removeMap(0, undefined);

      expect(result.data.maps).toEqual([]);
      expect(result.data.zoneLinks).toEqual(data.zoneLinks);
      expect(result.data.entryPoints).toEqual(data.entryPoints);
      expect(result.data.openConnections).toEqual(data.openConnections);
    });
  });

  it("setEntryPoint sets an entry point, including a null required key, without touching other entries", () => {
    const draft = new ZoneDraft(zoneData({entryPoints: {"cave_interior/pit": "iron_key"}}));
    const result = draft.setEntryPoint("cave_entrance/cave_mouth", null);
    expect(result.data.entryPoints).toEqual({"cave_interior/pit": "iron_key", "cave_entrance/cave_mouth": null});
  });

  it("removeEntryPoint removes an entry point by key", () => {
    const draft = new ZoneDraft(zoneData({entryPoints: {"cave_entrance/clearing": null, "cave_interior/pit": "iron_key"}}));
    const result = draft.removeEntryPoint("cave_entrance/clearing");
    expect(result.data.entryPoints).toEqual({"cave_interior/pit": "iron_key"});
  });

  it("setOpenConnection sets an open connection's exposed name", () => {
    const draft = new ZoneDraft(zoneData({openConnections: {}}));
    const result = draft.setOpenConnection("cave_entrance/back_door", "back_way");
    expect(result.data.openConnections).toEqual({"cave_entrance/back_door": "back_way"});
  });

  it("removeOpenConnection removes an open connection by key", () => {
    const draft = new ZoneDraft(zoneData({openConnections: {"cave_entrance/back_door": "back_way", "cave_interior/vent": "upper_vent"}}));
    const result = draft.removeOpenConnection("cave_entrance/back_door");
    expect(result.data.openConnections).toEqual({"cave_interior/vent": "upper_vent"});
  });

  it("removeZoneLink removes the zoneLink at the given index", () => {
    const draft = new ZoneDraft(zoneData({
      zoneLinks: [
        {connectionA: {map: "a", connection: "x"}, connectionB: {map: "b", connection: "y"}},
        {connectionA: {map: "c", connection: "z"}, connectionB: {map: "d", connection: "w"}},
      ],
    }));
    const result = draft.removeZoneLink(0);
    expect(result.data.zoneLinks).toEqual([{connectionA: {map: "c", connection: "z"}, connectionB: {map: "d", connection: "w"}}]);
  });

  it("addZoneLink adds a new zoneLink, assumed two-way and keyless, without touching existing links", () => {
    const draft = new ZoneDraft(zoneData({zoneLinks: [{connectionA: {map: "a", connection: "x"}, connectionB: {map: "b", connection: "y"}}]}));

    const result = draft.addZoneLink(
      {map: "cave_entrance", connection: "cave_mouth"},
      {map: "cave_interior", connection: "entrance"}
    );

    expect(result.data.zoneLinks).toEqual([
      {connectionA: {map: "a", connection: "x"}, connectionB: {map: "b", connection: "y"}},
      {connectionA: {map: "cave_entrance", connection: "cave_mouth"}, connectionB: {map: "cave_interior", connection: "entrance"}, oneWay: false, requiredKey: null},
    ]);
  });
});
