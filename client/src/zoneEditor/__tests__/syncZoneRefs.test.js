import {describe, it, expect} from "vitest";
import {syncZoneRefs} from "../syncZoneRefs";

const mapRef = [{$ref: "./woods/woods.json", referenceTo: "map"}];

function mapDetails(units) {
  return {woods: {identifier: "woods", name: "Woods", connections: [], units, thumbnailUrl: null}};
}

describe("syncZoneRefs", () => {
  it("adds an entry for a unitType a map uses but the zone's own dict is missing", () => {
    const zoneData = {name: "Demo", maps: mapRef, unitTypes: {}, items: {}};
    const details = mapDetails([{unitType: "demo/goblin-archer", itemKeys: []}]);

    const synced = syncZoneRefs(zoneData, details);

    expect(synced.unitTypes).toEqual({
      "demo/goblin-archer": {$ref: "../../unit_types/demo/goblin-archer.json", referenceTo: "unit_type"},
    });
  });

  it("adds an entry for an item a unit's lootTable uses but the zone's own dict is missing", () => {
    const zoneData = {name: "Demo", maps: mapRef, unitTypes: {}, items: {}};
    const details = mapDetails([{unitType: "demo/goblin-archer", itemKeys: ["raiders-cap"]}]);

    const synced = syncZoneRefs(zoneData, details);

    expect(synced.items).toEqual({
      "raiders-cap": {$ref: "../../items/raiders-cap.json", referenceTo: "item"},
    });
  });

  it("leaves an already-registered entry alone rather than overwriting it", () => {
    const customRef = {$ref: "../../unit_types/goblin.json", referenceTo: "unit_type"};
    const zoneData = {name: "Demo", maps: mapRef, unitTypes: {"demo/goblin-archer": customRef}, items: {}};
    const details = mapDetails([{unitType: "demo/goblin-archer", itemKeys: []}]);

    const synced = syncZoneRefs(zoneData, details);

    expect(synced.unitTypes["demo/goblin-archer"]).toBe(customRef);
  });

  it("keeps an entry no map currently uses, rather than removing it", () => {
    const staleRef = {$ref: "../../unit_types/unused.json", referenceTo: "unit_type"};
    const zoneData = {name: "Demo", maps: mapRef, unitTypes: {unused: staleRef}, items: {}};
    const details = mapDetails([]);

    const synced = syncZoneRefs(zoneData, details);

    expect(synced.unitTypes.unused).toBe(staleRef);
  });

  it("defaults to an empty dict when the zone has no unitTypes/items at all yet", () => {
    const zoneData = {name: "Demo", maps: []};

    const synced = syncZoneRefs(zoneData, {});

    expect(synced.unitTypes).toEqual({});
    expect(synced.items).toEqual({});
  });
});
